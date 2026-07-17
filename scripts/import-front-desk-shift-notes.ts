/**
 * Import Front Desk / Team Lead shift notes into Front Desk Log.
 *
 * Usage:
 *   npx tsx scripts/import-front-desk-shift-notes.ts --dry-run
 *   npx tsx scripts/import-front-desk-shift-notes.ts --write
 *   npx tsx scripts/import-front-desk-shift-notes.ts --write --file "/path/to.csv"
 *
 * Rules:
 * - submitted_by / created_by = "Front Desk"
 * - assigned_to / assigned_team = null (Unassigned)
 * - past dates → status Resolved (not open)
 * - today's date (America/Los_Angeles) → status Open in today's Daily Log
 * - no management alerts, follow-ups, or active issues
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CrossoverMessage, StaffOpsPriority, StaffOpsState } from "@/lib/staff/admin-ops";
import { listStaffOps } from "@/lib/staff/admin-ops";
import { loadEnvFiles } from "./load-env-local";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const IMPORT_MARKER = "csv-import:front-desk-shift-notes:v2";
const ACTOR = "Front Desk";
const SETTINGS_STORE_KEY = "staff_admin_ops";
const DEFAULT_SHEET_PATH = "/Users/fitdog/Downloads/Untitled spreadsheet - Sheet1.csv";

type ParsedNote = {
  source: "team_lead" | "front_desk";
  dateLabel: string;
  shift: "AM" | "PM" | "Unknown";
  author: string;
  note: string;
  category: string | null;
  priorityRaw: string | null;
  dogsToWatch: string | null;
  ownersToCall: string | null;
  managementFollowUp: string | null;
  reminderFlag: boolean;
  createdAt: string;
  importKey: string;
  isToday: boolean;
};

function parseArgs(argv: string[]) {
  const write = argv.includes("--write");
  const dryRun = !write || argv.includes("--dry-run");
  const fileFlagIndex = argv.indexOf("--file");
  const file =
    fileFlagIndex >= 0 && argv[fileFlagIndex + 1] ? resolve(argv[fileFlagIndex + 1]!) : DEFAULT_SHEET_PATH;
  return { write: write && !argv.includes("--dry-run"), dryRun, file };
}

function pacificTodayParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function isPacificToday(dateLabel: string) {
  const parts = parseDateParts(dateLabel);
  if (!parts) return false;
  const today = pacificTodayParts();
  return parts.year === today.year && parts.month === today.month && parts.day === today.day;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanCell(value: unknown) {
  if (value == null) return "";
  return normalizeWhitespace(String(value));
}

function parseShift(value: string): "AM" | "PM" | "Unknown" {
  const token = value.trim().toUpperCase();
  if (token === "AM") return "AM";
  if (token === "PM") return "PM";
  return "Unknown";
}

function parseDateParts(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (!month || !day || !year) return null;
  return { year, month, day };
}

/** Historical timestamps in America/Los_Angeles (Fitdog local). */
function toHistoricalIso(dateLabel: string, shift: "AM" | "PM" | "Unknown", indexInDay: number) {
  const parts = parseDateParts(dateLabel);
  if (!parts) return new Date().toISOString();

  const hour = shift === "PM" ? 17 : shift === "AM" ? 9 : 12;
  const minute = Math.min(59, indexInDay);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour + 8, minute, 0);
  // Keep a stable Pacific-ish afternoon/morning stamp without depending on Intl TZ data quirks.
  return new Date(utcGuess).toISOString();
}

function mapPriority(raw: string | null, managementFollowUp: string | null): StaffOpsPriority {
  const token = (raw ?? "").trim().toLowerCase();
  if (token === "critical") return "Critical";
  if (token === "urgent") return "Urgent";
  if (token === "high") return "High";
  if (token === "medium") return "Medium";
  if (token === "low") return "Low";
  if (token === "normal") return "Normal";

  const follow = (managementFollowUp ?? "").trim().toLowerCase();
  if (follow && follow !== "no" && follow !== "false" && follow !== "resolved") {
    return "High";
  }
  return "Normal";
}

function mapLogType(source: ParsedNote["source"], category: string | null, note: string): string {
  const hay = `${category ?? ""} ${note}`.toLowerCase();

  if (/assessment/.test(hay)) return "New Dog Assessment";
  if (/owner complaint|complaint/.test(hay)) return "Owner Complaint";
  if (/owner request|call owner|owners to call/.test(hay)) return "Owner Request";
  if (/groom/.test(hay)) return "Grooming Note";
  if (/train/.test(hay)) return "Training Note";
  if (/taxi|transport|pickup|pick up/.test(hay)) return "Transportation Note";
  if (/board|overnight|suite/.test(hay)) return "Boarding / Overnight Note";
  if (/daycare/.test(hay)) return "Daycare Note";
  if (/injury|health|medical|meds|diarrhea|blood|seizure|vomit/.test(hay)) return "Medical / Health Note";
  if (/belong|lost&found|lost and found|cubbie|bag on top/.test(hay)) return "Lost Belongings";
  if (/facility|yard|equipment|leak|latch|sink|lightning|lightening|ports/.test(hay)) return "Facility Issue";
  if (/handler|staff|performance|called out/.test(hay)) return "Staff Issue";
  if (/payment|billing|package/.test(hay)) return "Payment / Billing Note";
  if (/schedule|reservation/.test(hay)) return "Schedule / Reservation Issue";
  if (/remind/.test(hay)) return "Reminder";
  if (/management|follow up|follow-up/.test(hay)) return "Management Follow Up Needed";
  if (/behavior|conflict|fight|rotate|flight risk/.test(hay)) return "Dog Update";
  if (/clean|sanitation|bowl/.test(hay)) return "Facility Issue";
  if (/safety/.test(hay)) return "Staff Issue";
  if (source === "team_lead" && category) return "Daycare Note";
  return "General Shift Note";
}

function shouldSkipNote(note: string) {
  const token = note.trim().toLowerCase();
  if (!token) return true;
  if (token === "incomplete") return true;
  if (token === "no notes") return true;
  if (token === "nothing to report") return true;
  if (token === "nothing:)" || token === "nothing :)") return true;
  if (token === "all good!" || token === "all good") return true;
  if (token === "no issues w any dogs for am shift") return true;
  if (token === "n/a" || token === "na" || token === "-") return true;
  if (token === "true" || token === "false") return true;
  return false;
}

function truthyFlag(value: string) {
  const token = value.trim().toLowerCase();
  return token === "true" || token === "yes" || token === "y" || token === "1";
}

function importKeyFor(parts: Omit<ParsedNote, "importKey" | "createdAt" | "isToday">) {
  return createHash("sha1")
    .update(
      [
        IMPORT_MARKER,
        parts.source,
        parts.dateLabel,
        parts.shift,
        parts.author,
        parts.note,
        parts.category ?? "",
        parts.dogsToWatch ?? ""
      ].join("|")
    )
    .digest("hex");
}

function parseTeamLeadCsv(filePath: string): ParsedNote[] {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);

  const notes: ParsedNote[] = [];
  let currentDate = "";
  let currentShift: "AM" | "PM" | "Unknown" = "Unknown";
  let currentAuthor = "";
  let indexInDay = 0;
  let lastDayKey = "";

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const col0 = cleanCell(row[0]);
    if (i === 0 && /team lead/i.test(col0)) continue;
    if (i === 1 && /^date$/i.test(col0)) continue;

    const dateCell = cleanCell(row[0]);
    const shiftCell = cleanCell(row[1]);
    const authorCell = cleanCell(row[2]);
    const note = cleanCell(row[3]);
    const category = cleanCell(row[4]) || null;
    const priorityRaw = cleanCell(row[5]) || null;
    const managementFollowUp = cleanCell(row[6]) || null;
    const dogsToWatch = cleanCell(row[7]) || null;

    if (dateCell && parseDateParts(dateCell)) {
      currentDate = dateCell;
      currentShift = "Unknown";
      currentAuthor = "";
    }
    if (shiftCell) currentShift = parseShift(shiftCell);
    if (authorCell) currentAuthor = authorCell;

    if (!currentDate || shouldSkipNote(note)) continue;

    const dayKey = `${currentDate}|${currentShift}`;
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      indexInDay = 0;
    } else {
      indexInDay += 1;
    }

    const base = {
      source: "team_lead" as const,
      dateLabel: currentDate,
      shift: currentShift,
      author: currentAuthor || "Team Lead",
      note,
      category,
      priorityRaw,
      dogsToWatch,
      ownersToCall: null,
      managementFollowUp,
      reminderFlag: false
    };
    const isToday = isPacificToday(currentDate);

    notes.push({
      ...base,
      isToday,
      createdAt: isToday
        ? new Date(Date.now() + indexInDay * 1000).toISOString()
        : toHistoricalIso(currentDate, currentShift, indexInDay),
      importKey: importKeyFor(base)
    });
  }

  return notes;
}

function parseFrontDeskCsv(filePath: string): ParsedNote[] {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);

  const notes: ParsedNote[] = [];
  let currentDate = "";
  let currentShift: "AM" | "PM" | "Unknown" = "Unknown";
  let currentAuthor = "";
  let indexInDay = 0;
  let lastDayKey = "";

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const col0 = cleanCell(row[0]);
    // Header row for this spreadsheet / legacy crossover export
    if (
      i === 0 &&
      (/^date$/i.test(col0) || /crossover/i.test(col0) || /important notes/i.test(cleanCell(row[3])))
    ) {
      continue;
    }

    const dateCell = cleanCell(row[0]);
    const shiftCell = cleanCell(row[1]);
    const authorCell = cleanCell(row[2]);
    const note = cleanCell(row[3]);
    const reminder = cleanCell(row[4]);
    const dogsToWatch = cleanCell(row[5]) || null;
    const ownersToCall = cleanCell(row[6]) || null;
    const managementFollowUp = cleanCell(row[7]) || null;
    const operationalIssues = cleanCell(row[8]) || null;

    if (dateCell && parseDateParts(dateCell)) {
      currentDate = dateCell;
      currentShift = "Unknown";
      currentAuthor = "";
    }
    if (shiftCell) currentShift = parseShift(shiftCell);
    if (authorCell) currentAuthor = authorCell;

    if (!currentDate || shouldSkipNote(note)) continue;

    const dayKey = `${currentDate}|${currentShift}`;
    if (dayKey !== lastDayKey) {
      lastDayKey = dayKey;
      indexInDay = 0;
    } else {
      indexInDay += 1;
    }

    const reminderFlag = truthyFlag(reminder);
    const categoryBits = [
      reminderFlag ? "Reminder" : null,
      reminder && !reminderFlag && reminder.toUpperCase() !== "FALSE" ? `Reminder: ${reminder}` : null,
      operationalIssues ? `Ops: ${operationalIssues}` : null
    ]
      .filter(Boolean)
      .join(" • ");

    const base = {
      source: "front_desk" as const,
      dateLabel: currentDate,
      shift: currentShift,
      author: currentAuthor || "Front Desk Coordinator",
      note,
      category: categoryBits || null,
      priorityRaw: null,
      dogsToWatch,
      ownersToCall,
      managementFollowUp,
      reminderFlag
    };
    const isToday = isPacificToday(currentDate);

    notes.push({
      ...base,
      isToday,
      createdAt: isToday
        ? new Date(Date.now() + indexInDay * 1000).toISOString()
        : toHistoricalIso(currentDate, currentShift, indexInDay),
      importKey: importKeyFor(base)
    });
  }

  return notes;
}

function buildSubject(note: ParsedNote) {
  const shiftLabel = note.shift === "Unknown" ? "Shift" : note.shift;
  const sourceLabel = note.source === "team_lead" ? "TL" : "FD";
  const snippet = note.note.length > 72 ? `${note.note.slice(0, 69)}...` : note.note;
  return `[${sourceLabel} ${note.dateLabel} ${shiftLabel}] ${snippet}`;
}

function buildDetails(note: ParsedNote) {
  const footer = note.isToday
    ? "Imported from shift spreadsheet into today's Front Desk Log. Unassigned."
    : "Imported historical shift note. Closed / resolved (not open). Unassigned.";
  const lines = [
    note.note,
    "",
    `Shift: ${note.shift}`,
    `Logged by (original): ${note.author}`,
    note.category ? `Category: ${note.category}` : null,
    note.dogsToWatch ? `Dogs to watch: ${note.dogsToWatch}` : null,
    note.ownersToCall ? `Owners to call: ${note.ownersToCall}` : null,
    note.managementFollowUp ? `Management follow-up (original): ${note.managementFollowUp}` : null,
    "",
    footer
  ].filter((line) => line !== null) as string[];

  return lines.join("\n").slice(0, 4000);
}

function toCrossoverMessage(note: ParsedNote): CrossoverMessage {
  const details = buildDetails(note);
  const priority = mapPriority(note.priorityRaw, note.managementFollowUp);
  const logType = note.reminderFlag
    ? "Reminder"
    : mapLogType(note.source, note.category, note.note);
  const createdAt = note.createdAt;
  const status = note.isToday ? "Open" : "Resolved";

  return {
    id: randomUUID(),
    subject: buildSubject(note).slice(0, 240),
    message: details,
    details,
    log_type: logType,
    from_department: "Front Desk",
    to_department: "Front Desk Team",
    priority,
    status,
    related_dog_name: note.dogsToWatch ? note.dogsToWatch.slice(0, 200) : null,
    related_owner_name: note.ownersToCall ? note.ownersToCall.slice(0, 200) : null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: note.isToday ? "Today's Shift Notes Import" : "Historical Shift Notes Import",
    template_id: `${IMPORT_MARKER}:${note.importKey}`,
    template_field_values: {
      import_marker: IMPORT_MARKER,
      import_key: note.importKey,
      source_file: note.source,
      original_author: note.author,
      shift_date: note.dateLabel,
      shift: note.shift,
      is_today: note.isToday ? "1" : "0"
    },
    created_by: ACTOR,
    submitted_by: note.author || ACTOR,
    assigned_to: null,
    assigned_team: null,
    reported_to: null,
    department_area: note.source === "team_lead" ? "Team Leaders" : "Front Desk",
    due_at: null,
    reminder_at: null,
    needs_management_review: false,
    linked_owner_follow_up_id: null,
    linked_active_issue_id: null,
    management_alerted_at: null,
    urgent: false,
    created_at: createdAt,
    updated_at: createdAt,
    resolved_at: note.isToday ? null : createdAt,
    archived_at: null
  };
}

async function saveState(supabase: ReturnType<typeof getServiceSupabase>, state: StaffOpsState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;

  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };

  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

async function main() {
  loadEnvFiles();
  const { write, dryRun, file } = parseArgs(process.argv.slice(2));

  const includeLegacy = process.argv.includes("--include-legacy");
  let parsed: ParsedNote[] = [];
  try {
    parsed = parseFrontDeskCsv(file);
    console.log(`Parsed front-desk sheet: ${file} (${parsed.length} note(s))`);
  } catch (error) {
    throw new Error(`Unable to read CSV ${file}: ${error instanceof Error ? error.message : error}`);
  }

  // Optional legacy sources only when explicitly requested.
  if (includeLegacy) {
    const legacyTl = resolve(
      "/Users/fitdog/Downloads/TEAM LEAD CROSSOVER _ COMMUNICATIONS  - TL SHIFT NOTES.csv"
    );
    const legacyFd = resolve("/Users/fitdog/Downloads/Front_desk_operations_log - SHIFT NOTES.csv");
    for (const [label, path, parser] of [
      ["team_lead", legacyTl, parseTeamLeadCsv],
      ["front_desk_legacy", legacyFd, parseFrontDeskCsv]
    ] as const) {
      try {
        const extra = parser(path);
        if (extra.length) {
          parsed = [...parsed, ...extra];
          console.log(`Also parsed ${label}: ${extra.length} note(s)`);
        }
      } catch {
        // Optional legacy files may not exist.
      }
    }
  }

  const uniqueByKey = new Map<string, ParsedNote>();
  for (const note of parsed) {
    if (!uniqueByKey.has(note.importKey)) uniqueByKey.set(note.importKey, note);
  }
  const uniqueNotes = [...uniqueByKey.values()];

  const supabase = getServiceSupabase();
  const state = await listStaffOps(supabase);
  const existingKeys = new Set(
    state.crossover_messages
      .map((item) => {
        const fromTemplate = item.template_id?.includes(":")
          ? item.template_id.split(":").slice(-1)[0]
          : null;
        return fromTemplate || item.template_field_values?.import_key || null;
      })
      .filter(Boolean) as string[]
  );

  const toInsertNotes = uniqueNotes.filter((note) => !existingKeys.has(note.importKey));
  const toInsert = toInsertNotes.map(toCrossoverMessage);
  const todayCount = toInsertNotes.filter((note) => note.isToday).length;
  const pastCount = toInsertNotes.length - todayCount;

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        file,
        pacific_today: pacificTodayParts(),
        actor: ACTOR,
        assigned_to: null,
        parsed_rows: parsed.length,
        unique_notes: uniqueNotes.length,
        already_imported: uniqueNotes.length - toInsert.length,
        will_insert: toInsert.length,
        will_insert_today_open: todayCount,
        will_insert_past_resolved: pastCount,
        by_source: {
          team_lead: uniqueNotes.filter((n) => n.source === "team_lead").length,
          front_desk: uniqueNotes.filter((n) => n.source === "front_desk").length
        },
        today_sample: toInsert
          .filter((item) => item.status === "Open")
          .slice(0, 5)
          .map((item) => ({
            subject: item.subject,
            log_type: item.log_type,
            status: item.status,
            created_at: item.created_at
          })),
        past_sample: toInsert
          .filter((item) => item.status === "Resolved")
          .slice(0, 3)
          .map((item) => ({
            subject: item.subject,
            log_type: item.log_type,
            status: item.status,
            created_at: item.created_at
          }))
      },
      null,
      2
    )
  );

  if (dryRun || !write) {
    console.log("Dry run only. Re-run with --write to import.");
    return;
  }

  if (!toInsert.length) {
    console.log("Nothing new to import.");
    return;
  }

  const nextState: StaffOpsState = {
    ...state,
    crossover_messages: [...toInsert, ...state.crossover_messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    activity_logs: [
      {
        id: randomUUID(),
        activity_type: "shift_log.imported",
        title: `Imported ${toInsert.length} Front Desk logs (${todayCount} today open, ${pastCount} past resolved)`,
        description: `${IMPORT_MARKER} • submitted by ${ACTOR} • unassigned`,
        source_table: "crossover_messages",
        source_id: null,
        created_by: ACTOR,
        created_at: new Date().toISOString()
      },
      ...state.activity_logs
    ].slice(0, 100)
  };

  await saveState(supabase, nextState);
  console.log(
    `Imported ${toInsert.length} Front Desk logs (${todayCount} open for today, ${pastCount} resolved past).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
