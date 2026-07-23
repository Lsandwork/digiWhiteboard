/**
 * Import historical Front Desk notes into Open Log (status Open).
 * TRUE Reminder column → log_type Reminder (highlighted badge).
 * Past dates stay Open so staff can archive one-by-one.
 *
 * Usage:
 *   npx tsx scripts/import-open-log-historical.ts --dry-run
 *   npx tsx scripts/import-open-log-historical.ts --write
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { CrossoverMessage, StaffOpsState } from "@/lib/staff/admin-ops";
import { listStaffOps } from "@/lib/staff/admin-ops";
import { loadEnvFiles } from "./load-env-local";

const IMPORT_MARKER = "csv-import:front-desk-open-log:v2";
const ACTOR = "Front Desk";
const SETTINGS_STORE_KEY = "staff_admin_ops";
const DEFAULT_FILE = resolve(process.cwd(), "tmp-front-desk-open-log-batch-jul23.csv");

type ShiftToken = "AM" | "PM" | "OV" | "Unknown";

type ParsedNote = {
  dateLabel: string;
  shift: ShiftToken;
  author: string;
  note: string;
  logType: string | null;
  priority: "Low" | "Normal" | "Medium" | "High" | "Urgent" | "Critical" | null;
  reminderFlag: boolean;
  createdAt: string;
  importKey: string;
};

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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanCell(value: unknown) {
  if (value == null) return "";
  return normalizeWhitespace(String(value));
}

function parseShift(value: string): ShiftToken {
  const token = value.trim().toUpperCase();
  if (token === "AM") return "AM";
  if (token === "PM") return "PM";
  if (token === "OV" || token === "OVERNIGHT") return "OV";
  return "Unknown";
}

function parsePriority(value: string): ParsedNote["priority"] {
  const token = value.trim().toLowerCase();
  if (!token || token === "no" || token === "false") return null;
  if (token === "low") return "Low";
  if (token === "normal") return "Normal";
  if (token === "medium") return "Medium";
  if (token === "high") return "High";
  if (token === "urgent") return "Urgent";
  if (token === "critical") return "Critical";
  return null;
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

function toHistoricalIso(dateLabel: string, shift: ShiftToken, indexInDay: number) {
  const parts = parseDateParts(dateLabel);
  if (!parts) return new Date().toISOString();
  const hour = shift === "PM" ? 17 : shift === "AM" ? 9 : shift === "OV" ? 21 : 12;
  const minute = Math.min(59, indexInDay);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour + 8, minute, 0);
  return new Date(utcGuess).toISOString();
}

function shouldSkipNote(note: string) {
  const token = note.trim().toLowerCase();
  if (!token) return true;
  if (token === "nothing:)" || token === "nothing :)") return true;
  if (token === "nothing to report" || token === "ntr" || token === "none") return true;
  if (token === "true" || token === "false") return true;
  return false;
}

function truthyFlag(value: string) {
  const token = value.trim().toLowerCase();
  return token === "true" || token === "yes" || token === "y" || token === "1";
}

function mapLogType(note: string, reminderFlag: boolean, explicitType?: string | null): string {
  if (reminderFlag) return "Reminder";
  const explicit = cleanCell(explicitType);
  if (explicit) return explicit;
  const hay = note.toLowerCase();
  if (/assessment/.test(hay)) return "New Dog Assessment";
  if (/board|overnight|suite|cab\b|food/.test(hay)) return "Boarding / Overnight Note";
  if (/injury|health|medical|meds|stye|eye/.test(hay)) return "Medical / Health Note";
  if (/attack|fight|conflict/.test(hay)) return "Dog Conflict / Fight";
  if (/behavior|bedding|den/.test(hay)) return "Dog Behavior Concern";
  if (/no leash|belong|lost|cubbie|bag|bed|laundry/.test(hay)) return "Lost Belongings";
  if (/taxi|transport/.test(hay)) return "Transportation Note";
  if (/payment|billing|balance|pricing|charge|receipt|reciept|card on file/.test(hay)) {
    return "Payment / Billing Note";
  }
  if (/water bowl|facility|yard|room|pipe|condensation|condensaton/.test(hay)) return "Facility / Yard Issue";
  if (/gingr|sports account|log out/.test(hay)) return "Staff Issue";
  if (/call:|owner|follow/.test(hay)) return "Owner Request";
  if (/daycare|sports/.test(hay)) return "Daycare Note";
  return "General Shift Note";
}

function importKeyFor(parts: Omit<ParsedNote, "importKey" | "createdAt">) {
  return createHash("sha1")
    .update([IMPORT_MARKER, parts.dateLabel, parts.shift, parts.author, parts.note].join("|"))
    .digest("hex");
}

function parseNotes(filePath: string): ParsedNote[] {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);
  const notes: ParsedNote[] = [];
  let currentDate = "";
  let currentShift: ShiftToken = "Unknown";
  let currentAuthor = "";
  let indexInDay = 0;
  let lastDayKey = "";

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const col0 = cleanCell(row[0]);
    if (i === 0 && /^date$/i.test(col0)) continue;

    const dateCell = cleanCell(row[0]);
    const shiftCell = cleanCell(row[1]);
    const authorCell = cleanCell(row[2]);
    const note = cleanCell(row[3]);
    const typeCell = cleanCell(row[4]);
    const priorityCell = cleanCell(row[5]);
    // Support both old (Reminder in col 4) and new (Type/Priority/Reminder) layouts.
    const reminderCell = cleanCell(row[6] || (!typeCell && !priorityCell ? row[4] : ""));
    const looksLikeType =
      /dog|facility|behavior|injury|health|conflict|fight|boarding|owner|staff|medical|yard/i.test(typeCell);
    const logType = looksLikeType ? typeCell : null;
    const priority = parsePriority(priorityCell || (!looksLikeType ? typeCell : ""));
    const reminder = looksLikeType ? reminderCell : cleanCell(row[4]);

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
      dateLabel: currentDate,
      shift: currentShift,
      author: currentAuthor || "Front Desk Coordinator",
      note,
      logType,
      priority,
      reminderFlag: truthyFlag(reminder)
    };

    notes.push({
      ...base,
      createdAt: toHistoricalIso(currentDate, currentShift, indexInDay),
      importKey: importKeyFor(base)
    });
  }

  return notes;
}

function toCrossoverMessage(note: ParsedNote): CrossoverMessage {
  const shiftLabel = note.shift === "Unknown" ? "Shift" : note.shift;
  const snippet = note.note.length > 72 ? `${note.note.slice(0, 69)}...` : note.note;
  const subject = `[FD ${note.dateLabel} ${shiftLabel}] ${snippet}`.slice(0, 240);
  const details = [
    note.note,
    "",
    `Shift: ${note.shift}`,
    `Logged by (original): ${note.author}`,
    note.logType ? `Type: ${note.logType}` : null,
    note.reminderFlag ? "Spreadsheet Reminder: TRUE (highlighted)" : null,
    "",
    "Imported into Open Log for follow-up. Mark Resolved to move to Archived Log. Unassigned."
  ]
    .filter((line) => line !== null)
    .join("\n")
    .slice(0, 4000);

  return {
    id: randomUUID(),
    subject,
    message: details,
    details,
    log_type: mapLogType(note.note, note.reminderFlag, note.logType),
    from_department: "Front Desk",
    to_department: "Front Desk Team",
    priority: note.reminderFlag ? "High" : note.priority ?? "Normal",
    status: "Open",
    related_dog_name: null,
    related_owner_name: null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: "Open Log Historical Import",
    template_id: `${IMPORT_MARKER}:${note.importKey}`,
    template_field_values: {
      import_marker: IMPORT_MARKER,
      import_key: note.importKey,
      original_author: note.author,
      shift_date: note.dateLabel,
      shift: note.shift,
      reminder_flag: note.reminderFlag ? "1" : "0"
    },
    created_by: ACTOR,
    submitted_by: note.author || ACTOR,
    assigned_to: null,
    assigned_team: null,
    reported_to: null,
    department_area: "Front Desk",
    due_at: null,
    reminder_at: null,
    needs_management_review: false,
    linked_owner_follow_up_id: null,
    linked_active_issue_id: null,
    management_alerted_at: null,
    urgent: note.reminderFlag,
    created_at: note.createdAt,
    updated_at: note.createdAt,
    resolved_at: null,
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
  const write = process.argv.includes("--write") && !process.argv.includes("--dry-run");
  const fileFlag = process.argv.indexOf("--file");
  const file =
    fileFlag >= 0 && process.argv[fileFlag + 1] ? resolve(process.argv[fileFlag + 1]!) : DEFAULT_FILE;

  const parsed = parseNotes(file);
  const uniqueByKey = new Map<string, ParsedNote>();
  for (const note of parsed) {
    if (!uniqueByKey.has(note.importKey)) uniqueByKey.set(note.importKey, note);
  }
  const uniqueNotes = [...uniqueByKey.values()];

  const supabase = getServiceSupabase();
  const state = await listStaffOps(supabase);
  const existingKeys = new Set(
    state.crossover_messages
      .map((item) => item.template_field_values?.import_key || item.template_id?.split(":").slice(-1)[0] || null)
      .filter(Boolean) as string[]
  );

  const toInsertNotes = uniqueNotes.filter((note) => !existingKeys.has(note.importKey));
  const toInsert = toInsertNotes.map(toCrossoverMessage);
  const highlighted = toInsertNotes.filter((n) => n.reminderFlag).length;

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "dry-run",
        file,
        parsed_rows: parsed.length,
        unique_notes: uniqueNotes.length,
        already_imported: uniqueNotes.length - toInsert.length,
        will_insert_open: toInsert.length,
        will_insert_highlighted_reminder: highlighted,
        sample: toInsert.slice(0, 5).map((item) => ({
          subject: item.subject,
          log_type: item.log_type,
          status: item.status,
          urgent: item.urgent,
          submitted_by: item.submitted_by,
          created_at: item.created_at
        }))
      },
      null,
      2
    )
  );

  if (!write) {
    console.log("Dry run only. Re-run with --write to import into Open Log.");
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
        title: `Imported ${toInsert.length} historical notes into Open Log`,
        description: `${IMPORT_MARKER} • ${highlighted} highlighted Reminder row(s)`,
        source_table: "crossover_messages",
        source_id: null,
        created_by: ACTOR,
        created_at: new Date().toISOString()
      },
      ...state.activity_logs
    ].slice(0, 100)
  };

  await saveState(supabase, nextState);
  console.log(`Imported ${toInsert.length} Open Log entries (${highlighted} highlighted).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
