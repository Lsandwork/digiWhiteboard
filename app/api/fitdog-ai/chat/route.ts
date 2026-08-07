import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { generateFitdogText, fitdogAiUserFacingError, isGeminiConfigured } from "@/lib/ai/geminiClient";
import { buildFitdogAiSystemPrompt, buildFitdogAiUserPrompt } from "@/lib/ai/fitdogAiPrompt";
import { buildFitdogUserContext } from "@/lib/ai/fitdogUserContext";
import {
  detectToneHint,
  guardChatResponse,
  normalizeChatJson,
  parseGeminiJson,
  type GeminiChatJson
} from "@/lib/ai/fitdogAiGuards";
import { fallbackActionLinks, canAccessActionIntent } from "@/lib/ai/fitdogActionLinks";
import {
  buildPushSuccessReply,
  executeFitdogAiPushNotice,
  inferPushNoticeDraft,
  type FitdogAiChatHistoryItem
} from "@/lib/ai/fitdogAiPushNotice";
import { answerCommissionQuestion } from "@/lib/ai/fitdogAiCommissionAnswer";
import {
  buildLocalChatFallback,
  FITDOG_AI_GLITCH_REPLY,
  isGlitchAiReply
} from "@/lib/ai/fitdogAiLocalFallback";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseHistory(raw: unknown): FitdogAiChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const role = row.role === "assistant" ? "assistant" : row.role === "user" ? "user" : null;
      const content = String(row.content ?? "").trim();
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean) as FitdogAiChatHistoryItem[];
}

async function respondFromParsed(params: {
  session: NonNullable<ReturnType<typeof getAdminSessionFromRequest>>;
  context: Awaited<ReturnType<typeof buildFitdogUserContext>>;
  message: string;
  history: FitdogAiChatHistoryItem[];
  parsed: ReturnType<typeof normalizeChatJson>;
  toneHint: ReturnType<typeof detectToneHint>;
}) {
  const { session, context, message, history, parsed, toneHint } = params;

  let pushNoticePushed = false;
  let pushNoticeResult: { title: string; message: string | null; id: string } | null = null;
  let pendingPushNotice = parsed.pushNotice;

  const canPush = canAccessActionIntent(context.access, "push_notice");
  let draftToPush = parsed.pushNotice?.ready ? parsed.pushNotice : null;
  if (!draftToPush?.ready && canPush) {
    const inferred = inferPushNoticeDraft(message, history);
    if (inferred?.ready) draftToPush = inferred;
  }

  if (draftToPush?.ready && canPush && draftToPush.title) {
    try {
      const notice = await executeFitdogAiPushNotice({ session, access: context.access, draft: draftToPush });
      if (notice) {
        pushNoticePushed = true;
        pushNoticeResult = { id: notice.id, title: notice.title, message: notice.message };
        parsed.reply = buildPushSuccessReply(notice);
        pendingPushNotice = null;
      }
    } catch (pushError) {
      console.error("[fitdog-ai/chat] Push notice failed:", pushError);
      parsed.reply =
        "I understood the notice but couldn't push it just now. Open Push Notices and send it manually, or try again in a moment.";
      pendingPushNotice = draftToPush;
    }
  } else if (parsed.pushNotice?.title && !parsed.pushNotice.ready && canPush) {
    pendingPushNotice = parsed.pushNotice;
  }

  const guarded = guardChatResponse({
    access: context.access,
    parsed,
    toneHint,
    pushNoticePushed,
    pendingPushNotice
  });

  return NextResponse.json({
    reply: guarded.reply,
    actionLinks: guarded.actionLinks,
    suggestedNextStep: guarded.suggestedNextStep,
    tone: guarded.tone,
    pushNoticeResult,
    pendingPushNotice: guarded.pendingPushNotice ?? null
  });
}

async function resolveReliableParsed(params: {
  session: NonNullable<ReturnType<typeof getAdminSessionFromRequest>>;
  context: Awaited<ReturnType<typeof buildFitdogUserContext>>;
  message: string;
  history: FitdogAiChatHistoryItem[];
  parsed?: ReturnType<typeof normalizeChatJson> | null;
}): Promise<ReturnType<typeof normalizeChatJson>> {
  const { session, context, message, history, parsed } = params;

  if (parsed?.reply?.trim() && !isGlitchAiReply(parsed.reply)) {
    return parsed;
  }

  const commission = await answerCommissionQuestion({ session, context, message });
  if (commission) {
    return normalizeChatJson(commission, commission.reply);
  }

  const local = buildLocalChatFallback({ message, history, context });
  if (local) {
    return normalizeChatJson(local, local.reply);
  }

  return normalizeChatJson(
    {
      reply:
        "I couldn't finish that answer cleanly. Ask me again in a second, or open the Fitdog page you need — Team Log for shift notes, Package & Class Commissions for earnings, or Management Support for complaints.",
      actionIntent: "front_desk_log",
      secondaryActionIntent: "package_commissions",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    },
    "Ask me again in a second."
  );
}

export async function GET() {
  return NextResponse.json({ configured: isGeminiConfigured() });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  let message = "";
  let history: FitdogAiChatHistoryItem[] = [];
  let currentPage: string | undefined;
  let recentContext: Record<string, unknown> | undefined;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    }
    currentPage = String(body.currentPage ?? "").trim() || undefined;
    history = parseHistory(body.history);
    recentContext =
      body.recentContext && typeof body.recentContext === "object"
        ? (body.recentContext as Record<string, unknown>)
        : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  try {
    // Lightweight + cached context keeps chat turns fast without extra DB round-trips.
    const context = await buildFitdogUserContext({ session, currentPage, lightweight: true });
    const toneHint = detectToneHint(message);
    const shortHistory = history.slice(-4);

    // Deterministic ledger answers — never depend on Gemini for commission totals.
    const commission = await answerCommissionQuestion({ session, context, message });
    if (commission) {
      const parsed = normalizeChatJson(commission, commission.reply);
      return respondFromParsed({ session, context, message, history: shortHistory, parsed, toneHint });
    }

    if (!isGeminiConfigured()) {
      const parsed = await resolveReliableParsed({ session, context, message, history: shortHistory });
      return respondFromParsed({ session, context, message, history: shortHistory, parsed, toneHint });
    }

    const systemInstruction = buildFitdogAiSystemPrompt(context);
    const userPrompt = buildFitdogAiUserPrompt({
      message,
      context,
      toneHint,
      recentContext,
      history: shortHistory
    });

    let parsed: ReturnType<typeof normalizeChatJson>;

    try {
      const { text } = await generateFitdogText({
        systemInstruction,
        userMessage: userPrompt,
        jsonMode: true,
        fastChat: true
      });

      const fallback: GeminiChatJson = {
        reply: FITDOG_AI_GLITCH_REPLY,
        actionIntent: toneHint === "safety" ? "front_desk_log" : "none",
        secondaryActionIntent: "none",
        tone: toneHint ?? "normal",
        needsEscalation: toneHint === "safety",
        escalationReason: toneHint === "safety" ? "Possible safety concern mentioned." : "",
        pushNotice: null
      };

      parsed = normalizeChatJson(parseGeminiJson<Partial<GeminiChatJson>>(text, fallback), fallback.reply);
      parsed = await resolveReliableParsed({
        session,
        context,
        message,
        history: shortHistory,
        parsed
      });
    } catch (geminiError) {
      console.error("[fitdog-ai/chat] Gemini failed, using reliable fallback:", geminiError);
      parsed = await resolveReliableParsed({ session, context, message, history: shortHistory });
    }

    return respondFromParsed({ session, context, message, history: shortHistory, parsed, toneHint });
  } catch (error) {
    console.error("[fitdog-ai/chat] Request failed:", error);
    try {
      const context = await buildFitdogUserContext({ session, currentPage, lightweight: true });
      const shortHistory = history.slice(-4);
      const parsed = await resolveReliableParsed({ session, context, message, history: shortHistory });
      return respondFromParsed({
        session,
        context,
        message,
        history: shortHistory,
        parsed,
        toneHint: detectToneHint(message)
      });
    } catch (fallbackError) {
      console.error("[fitdog-ai/chat] Reliable fallback failed:", fallbackError);
    }

    const context = await buildFitdogUserContext({ session, currentPage, lightweight: true }).catch(() => null);
    return NextResponse.json(
      {
        error: fitdogAiUserFacingError(error),
        reply:
          "I hit a snag answering that. Try one more time — or open Team Log / Package & Class Commissions / Management Support while it's fresh.",
        actionLinks: context ? fallbackActionLinks(context.access, "normal") : [],
        tone: "normal"
      },
      { status: 500 }
    );
  }
}
