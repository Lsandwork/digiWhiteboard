import {
  canManagePackageCommissions,
  canViewPackageCommissions
} from "@/lib/admin/api-auth";
import { hasPermission, hasRole, legacyRoleToRoleKey } from "@/lib/admin/permissions";
import type { AdminSession } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { listAdminUsers } from "@/lib/admin/users";
import type { GeminiChatJson } from "@/lib/ai/fitdogAiGuards";
import type { FitdogUserContext } from "@/lib/ai/fitdogUserContext";
import { centsToDisplay } from "@/lib/staff/commission-ledger/money";
import { listCommissionRecords } from "@/lib/staff/commission-ledger/records";
import { listCommissionTrainerOptions } from "@/lib/staff/commission-ledger/trainers";
import type { CommissionViewer } from "@/lib/staff/commission-ledger/types";
import { getServiceSupabase } from "@/lib/supabase/server";

const NAME_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "my",
  "me",
  "mine",
  "our",
  "i",
  "we",
  "how",
  "much",
  "show",
  "tell",
  "give",
  "what",
  "who",
  "for",
  "from",
  "last",
  "this",
  "past",
  "next",
  "week",
  "weeks",
  "month",
  "months",
  "day",
  "days",
  "year",
  "years",
  "total",
  "about",
  "made",
  "make",
  "earn",
  "earned",
  "paid",
  "commission",
  "commissions",
  "earning",
  "earnings",
  "trainer",
  "trainers",
  "package",
  "class",
  "and",
  "or",
  "to",
  "in",
  "on",
  "of",
  "did",
  "has",
  "have",
  "was",
  "were",
  "all",
  "any",
  "some",
  "please",
  "can",
  "could",
  "would",
  "two",
  "2",
  "14",
  "30"
]);

export type ParsedCommissionQuestion = {
  trainerQuery: string | null;
  self: boolean;
  dateFrom: string;
  dateTo: string;
  rangeLabel: string;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekSunday(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function formatDisplayDate(iso: string) {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function cleanName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const parts = cleaned.split(" ").filter((part) => !NAME_STOP_WORDS.has(part.toLowerCase()));
  if (!parts.length) return null;
  return parts.join(" ");
}

export function isCommissionQuestion(message: string): boolean {
  const text = message.toLowerCase();
  if (/\bcommissions?\b/.test(text)) return true;
  if (/\btrainer share\b/.test(text)) return true;
  if (/\bearnings?\b/.test(text) && /\b(trainer|package|class|week|month|paid|payroll)\b/.test(text)) {
    return true;
  }
  if (/\bhow much\b/.test(text) && /\b(made|make|earn|earned|paid)\b/.test(text)) return true;
  if (/\b(package|class)\b.*\bcommission/.test(text)) return true;
  return false;
}

export function parseCommissionDateRange(
  message: string,
  now = new Date()
): { dateFrom: string; dateTo: string; rangeLabel: string } {
  const text = message.toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateTo = toIsoDate(today);

  if (/last\s+(two|2)\s+weeks|past\s+(two|2)\s+weeks|last\s+14\s+days|past\s+14\s+days/.test(text)) {
    return {
      dateFrom: toIsoDate(addDays(today, -13)),
      dateTo,
      rangeLabel: "the last two weeks"
    };
  }

  if (/this\s+week/.test(text)) {
    return {
      dateFrom: toIsoDate(startOfWeekSunday(today)),
      dateTo,
      rangeLabel: "this week"
    };
  }

  if (/last\s+week/.test(text)) {
    const thisWeekStart = startOfWeekSunday(today);
    const lastWeekStart = addDays(thisWeekStart, -7);
    const lastWeekEnd = addDays(thisWeekStart, -1);
    return {
      dateFrom: toIsoDate(lastWeekStart),
      dateTo: toIsoDate(lastWeekEnd),
      rangeLabel: "last week"
    };
  }

  if (/this\s+month/.test(text)) {
    return {
      dateFrom: `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`,
      dateTo,
      rangeLabel: "this month"
    };
  }

  if (/last\s+month/.test(text)) {
    const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthEnd = addDays(firstThisMonth, -1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    return {
      dateFrom: toIsoDate(lastMonthStart),
      dateTo: toIsoDate(lastMonthEnd),
      rangeLabel: "last month"
    };
  }

  if (/\btoday\b/.test(text)) {
    return { dateFrom: dateTo, dateTo, rangeLabel: "today" };
  }

  if (/\byesterday\b/.test(text)) {
    const yesterday = toIsoDate(addDays(today, -1));
    return { dateFrom: yesterday, dateTo: yesterday, rangeLabel: "yesterday" };
  }

  if (/last\s+30\s+days|past\s+30\s+days|past\s+month/.test(text)) {
    return {
      dateFrom: toIsoDate(addDays(today, -29)),
      dateTo,
      rangeLabel: "the last 30 days"
    };
  }

  if (/last\s+7\s+days|past\s+7\s+days/.test(text)) {
    return {
      dateFrom: toIsoDate(addDays(today, -6)),
      dateTo,
      rangeLabel: "the last 7 days"
    };
  }

  // Default window for open-ended commission totals.
  return {
    dateFrom: toIsoDate(addDays(today, -13)),
    dateTo,
    rangeLabel: "the last two weeks"
  };
}

export function parseCommissionTrainerQuery(message: string): { trainerQuery: string | null; self: boolean } {
  const possessive = message.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|’s)\s+(?:commission|earning|total|pay|paycheck)/i
  );
  const commissionsMade = message.match(
    /\bcommissions?\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:made|earned|has|got)\b/i
  );
  const howMuchDid = message.match(
    /\bhow much\s+(?:did|has)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:make|made|earn|earned)\b/i
  );
  const forTrainer = message.match(/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  const aboutTrainer = message.match(/\b(?:about|on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);

  const trainerQuery =
    cleanName(possessive?.[1]) ||
    cleanName(commissionsMade?.[1]) ||
    cleanName(howMuchDid?.[1]) ||
    cleanName(forTrainer?.[1]) ||
    cleanName(aboutTrainer?.[1]) ||
    null;

  const self =
    !trainerQuery &&
    (/\b(my|mine)\b/i.test(message) ||
      /\b(?:did|have|has)\s+i\s+(?:make|made|earn|earned)\b/i.test(message) ||
      /\bi\s+(?:make|made|earn|earned)\b/i.test(message)) &&
    /\b(commission|commissions|earnings?|made|earn|earned|paid)\b/i.test(message);

  return { trainerQuery, self };
}

export function parseCommissionQuestion(message: string, now = new Date()): ParsedCommissionQuestion | null {
  if (!isCommissionQuestion(message)) return null;
  const range = parseCommissionDateRange(message, now);
  const trainer = parseCommissionTrainerQuery(message);
  return {
    trainerQuery: trainer.trainerQuery,
    self: trainer.self,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    rangeLabel: range.rangeLabel
  };
}

function buildViewer(
  session: AdminSession,
  access: Awaited<ReturnType<typeof getUserAccess>> | null,
  canManage: boolean
): CommissionViewer {
  const roleKey = legacyRoleToRoleKey(session.role ?? null);
  const isSuperAdmin =
    hasRole(access, "super_admin") || session.role === "owner_admin" || roleKey === "super_admin";
  const isTrainerOnly =
    !canManage &&
    (session.role === "trainer" || hasRole(access, "trainer") || roleKey === "trainer");

  return {
    role: session.role ?? null,
    roleKey,
    email: session.email ?? null,
    adminUserId: session.adminUserId ?? null,
    canManage,
    canComment: true,
    isSuperAdmin,
    isTrainerOnly
  };
}

function matchTrainerName(
  query: string,
  trainers: Array<{ id: string; full_name: string; email: string }>
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const exact = trainers.find((trainer) => trainer.full_name.trim().toLowerCase() === needle);
  if (exact) return exact;
  const starts = trainers.filter((trainer) => trainer.full_name.trim().toLowerCase().startsWith(needle));
  if (starts.length === 1) return starts[0]!;
  const includes = trainers.filter((trainer) => trainer.full_name.trim().toLowerCase().includes(needle));
  if (includes.length === 1) return includes[0]!;
  if (includes.length > 1) {
    const firstNameHits = includes.filter((trainer) => {
      const first = trainer.full_name.trim().split(/\s+/)[0]?.toLowerCase();
      return first === needle;
    });
    if (firstNameHits.length === 1) return firstNameHits[0]!;
    return { ambiguous: includes.slice(0, 5).map((trainer) => trainer.full_name) };
  }
  return null;
}

export async function answerCommissionQuestion(params: {
  session: AdminSession;
  context: FitdogUserContext;
  message: string;
  now?: Date;
}): Promise<GeminiChatJson | null> {
  const parsed = parseCommissionQuestion(params.message, params.now);
  if (!parsed) return null;

  const access = params.context.access;
  const canView =
    canViewPackageCommissions(params.session.role) ||
    hasPermission(access, "view_package_commissions") ||
    hasPermission(access, "manage_package_commissions");
  const canManage =
    canManagePackageCommissions(params.session.role) ||
    hasPermission(access, "manage_package_commissions") ||
    hasRole(access, "super_admin") ||
    hasRole(access, "admin");

  if (!canView) {
    return {
      reply:
        "You don't have access to Package & Class Commissions. Ask a team lead or admin if you need that unlocked.",
      actionIntent: "none",
      secondaryActionIntent: "none",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  }

  const viewer = buildViewer(params.session, access, canManage);
  const supabase = getServiceSupabase();

  let trainerIds: string[] | undefined;
  let trainerNames: string[] | undefined;
  let trainerLabel = parsed.self ? "your" : parsed.trainerQuery;

  if (parsed.self || (!parsed.trainerQuery && viewer.isTrainerOnly)) {
    trainerLabel = "your";
    if (viewer.adminUserId) trainerIds = [viewer.adminUserId];
  } else if (parsed.trainerQuery) {
    if (viewer.isTrainerOnly) {
      const ownName = (params.session.email ?? "").split("@")[0] ?? "";
      const askingSelf =
        parsed.trainerQuery.toLowerCase() === ownName.toLowerCase() ||
        parsed.trainerQuery.toLowerCase() === String(params.context.userName ?? "").toLowerCase();
      if (!askingSelf) {
        return {
          reply:
            "Trainers can only view their own commission totals here. Open Package & Class Commissions for your ledger, or ask an admin for another trainer's numbers.",
          actionIntent: "package_commissions",
          secondaryActionIntent: "none",
          tone: "normal",
          needsEscalation: false,
          escalationReason: "",
          pushNotice: null
        };
      }
      trainerLabel = "your";
      if (viewer.adminUserId) trainerIds = [viewer.adminUserId];
    } else {
      try {
        const users = await listAdminUsers(supabase);
        const trainers = listCommissionTrainerOptions(users);
        const matched = matchTrainerName(parsed.trainerQuery, trainers);
        if (matched && "ambiguous" in matched) {
          return {
            reply: `I found a few trainers that match "${parsed.trainerQuery}": ${matched.ambiguous.join(", ")}. Which one did you mean?`,
            actionIntent: "package_commissions",
            secondaryActionIntent: "none",
            tone: "normal",
            needsEscalation: false,
            escalationReason: "",
            pushNotice: null
          };
        }
        if (matched && "id" in matched) {
          trainerIds = [matched.id];
          trainerLabel = matched.full_name;
        } else {
          trainerNames = [parsed.trainerQuery];
          trainerLabel = parsed.trainerQuery;
        }
      } catch (error) {
        console.error("[fitdog-ai] Trainer lookup failed, falling back to name filter:", error);
        trainerNames = [parsed.trainerQuery];
        trainerLabel = parsed.trainerQuery;
      }
    }
  }

  try {
    const result = await listCommissionRecords(
      supabase,
      viewer,
      {
        trainerIds,
        trainerNames,
        dateField: "sale_date",
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        page: 1,
        pageSize: 25,
        sortBy: "sale_date",
        sortDir: "desc"
      },
      { includeSummary: true }
    );

    const total = centsToDisplay(result.summary.totalCommissionsCents);
    const paid = centsToDisplay(result.summary.paidCents);
    const approved = centsToDisplay(result.summary.approvedCents);
    const pending = centsToDisplay(result.summary.pendingReviewCents);
    const fromLabel = formatDisplayDate(parsed.dateFrom);
    const toLabel = formatDisplayDate(parsed.dateTo);
    const subject =
      trainerLabel === "your" ? "Your commissions" : `${trainerLabel}'s commissions`;

    if (!result.total) {
      return {
        reply: `${subject}: I don't see any ledger rows for ${parsed.rangeLabel} (${fromLabel}–${toLabel}). Open Package & Class Commissions to widen the date range or check spelling.`,
        actionIntent: "package_commissions",
        secondaryActionIntent: "none",
        tone: "normal",
        needsEscalation: false,
        escalationReason: "",
        pushNotice: null
      };
    }

    const reply = [
      `${subject} for ${parsed.rangeLabel} (sale/service ${fromLabel}–${toLabel}): ${total} across ${result.total} record${result.total === 1 ? "" : "s"}.`,
      `Paid ${paid} · approved ${approved} · still in review ${pending}.`,
      "Open Package & Class Commissions if you want the full row-by-row ledger."
    ].join(" ");

    return {
      reply,
      actionIntent: "package_commissions",
      secondaryActionIntent: "none",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  } catch (error) {
    console.error("[fitdog-ai] Commission ledger query failed:", error);
    return {
      reply: `I couldn't load the commission ledger just now. Open Package & Class Commissions and filter ${
        trainerLabel === "your" ? "your rows" : `for ${trainerLabel}`
      } for ${parsed.rangeLabel} — the totals are there.`,
      actionIntent: "package_commissions",
      secondaryActionIntent: "none",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  }
}
