import { pacificDayBounds } from "@/lib/body-checks/dates";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ValidatedInspection } from "@/lib/body-checks/validation";
import type {
  BodyCheckReport,
  BodyCheckSeverity,
  FollowUpEvent,
  FollowUpKind,
  FollowUpStatus,
  ServiceCategory
} from "@/lib/body-checks/types";
import { FOLLOW_UP_STATUSES } from "@/lib/body-checks/types";

type Db = ReturnType<typeof getServiceSupabase>;

function asFindings(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function mapReport(row: Record<string, unknown>): BodyCheckReport {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    gingrAnimalId: String(row.gingr_animal_id),
    dogName: String(row.dog_name),
    photoUrl: row.dog_photo_url ? String(row.dog_photo_url) : null,
    ownerId: row.gingr_owner_id ? String(row.gingr_owner_id) : null,
    ownerName: row.owner_name ? String(row.owner_name) : null,
    reservationId: row.gingr_reservation_id ? String(row.gingr_reservation_id) : null,
    serviceType: row.service_type ? String(row.service_type) : null,
    serviceCategory: (row.service_category as ServiceCategory) || "other",
    locationId: row.location_id ? String(row.location_id) : null,
    staffUserId: row.staff_user_id ? String(row.staff_user_id) : null,
    staffName: String(row.staff_name),
    inspectedAt: String(row.inspected_at),
    ears: asFindings(row.ears),
    nails: asFindings(row.nails),
    bodyGrooming: asFindings(row.body_grooming),
    bodyPhysical: asFindings(row.body_physical),
    notes: row.notes ? String(row.notes) : null,
    severity: row.severity as BodyCheckSeverity,
    followUpStatus: row.follow_up_status as FollowUpStatus,
    followUpKinds: Array.isArray(row.follow_up_kinds) ? (row.follow_up_kinds as FollowUpKind[]) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

const REPORT_COLUMNS =
  "id, idempotency_key, gingr_animal_id, dog_name, dog_photo_url, gingr_owner_id, owner_name, gingr_reservation_id, service_type, service_category, location_id, staff_user_id, staff_name, inspected_at, ears, nails, body_grooming, body_physical, notes, severity, follow_up_status, follow_up_kinds, created_at, updated_at";

export async function findReportByIdempotency(db: Db, key: string): Promise<BodyCheckReport | null> {
  const { data, error } = await db.from("body_check_reports").select(REPORT_COLUMNS).eq("idempotency_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapReport(data as Record<string, unknown>) : null;
}

export async function insertBodyCheckReport(
  db: Db,
  inspection: ValidatedInspection,
  actor: { userId: string | null; name: string }
): Promise<{ report: BodyCheckReport; created: boolean }> {
  const existing = await findReportByIdempotency(db, inspection.idempotencyKey);
  if (existing) return { report: existing, created: false };

  const followUpStatus: FollowUpStatus =
    inspection.severity === "routine" && inspection.followUpKinds.length === 0 ? "none" : "required";

  const { data, error } = await db
    .from("body_check_reports")
    .insert({
      idempotency_key: inspection.idempotencyKey,
      gingr_animal_id: inspection.gingrAnimalId,
      dog_name: inspection.dogName,
      dog_photo_url: inspection.photoUrl,
      gingr_owner_id: inspection.ownerId,
      owner_name: inspection.ownerName,
      gingr_reservation_id: inspection.reservationId,
      service_type: inspection.serviceType,
      service_category: inspection.serviceCategory,
      location_id: inspection.locationId,
      staff_user_id: actor.userId,
      staff_name: actor.name,
      ears: inspection.ears,
      nails: inspection.nails,
      body_grooming: inspection.bodyGrooming,
      body_physical: inspection.bodyPhysical,
      notes: inspection.notes,
      severity: inspection.severity,
      follow_up_status: followUpStatus,
      follow_up_kinds: inspection.followUpKinds,
      submission_status: "submitted"
    })
    .select(REPORT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const raced = await findReportByIdempotency(db, inspection.idempotencyKey);
      if (raced) return { report: raced, created: false };
    }
    throw new Error(error.message);
  }
  return { report: mapReport(data as Record<string, unknown>), created: true };
}

export type ReportQuery = {
  query?: string;
  from?: string;
  to?: string;
  severity?: string;
  followUp?: string;
  finding?: string;
  staff?: string;
  limit?: number;
  offset?: number;
  sort?: "newest" | "oldest";
};

export async function listBodyCheckReports(db: Db, query: ReportQuery): Promise<{ reports: BodyCheckReport[]; total: number }> {
  const limit = Math.min(50, Math.max(1, query.limit ?? 25));
  const offset = Math.max(0, query.offset ?? 0);
  let request = db.from("body_check_reports").select(REPORT_COLUMNS, { count: "exact" });
  const fromBounds = query.from ? pacificDayBounds(query.from) : null;
  const toBounds = query.to ? pacificDayBounds(query.to) : null;
  if (fromBounds) request = request.gte("inspected_at", fromBounds.start);
  if (toBounds) request = request.lte("inspected_at", toBounds.end);
  if (query.severity) request = request.eq("severity", query.severity);
  if (query.followUp) request = request.eq("follow_up_status", query.followUp);
  if (query.staff) {
    const staff = query.staff.replace(/[^a-zA-Z0-9\s'-]/g, "").trim().slice(0, 80);
    if (staff) request = request.ilike("staff_name", `%${staff}%`);
  }
  const text = query.query?.trim();
  if (text) {
    const safe = text.replace(/[^a-zA-Z0-9\s'-]/g, "").trim().slice(0, 80);
    if (safe) request = request.or(`dog_name.ilike.%${safe}%,owner_name.ilike.%${safe}%`);
  }
  const { data, error, count } = await request
    .order("inspected_at", { ascending: query.sort === "oldest" })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  let reports = (data ?? []).map((row) => mapReport(row as Record<string, unknown>));
  if (query.finding) {
    const needle = query.finding.toLowerCase();
    reports = reports.filter((report) =>
      [...report.ears, ...report.nails, ...report.bodyGrooming, ...report.bodyPhysical].some(
        (finding) => finding.id === needle || finding.label.toLowerCase().includes(needle)
      )
    );
  }
  return { reports, total: count ?? reports.length };
}

export async function getBodyCheckReport(db: Db, id: string): Promise<{ report: BodyCheckReport; events: FollowUpEvent[] } | null> {
  const { data, error } = await db.from("body_check_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const eventsResult = await db
    .from("body_check_follow_up_events")
    .select("id, report_id, from_status, to_status, note, changed_by_name, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  const events: FollowUpEvent[] = (eventsResult.data ?? []).map((row) => ({
    id: String(row.id),
    reportId: String(row.report_id),
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: row.to_status as FollowUpStatus,
    note: row.note ? String(row.note) : null,
    changedByName: String(row.changed_by_name),
    createdAt: String(row.created_at)
  }));
  return { report: mapReport(data as Record<string, unknown>), events };
}

export async function updateFollowUp(
  db: Db,
  id: string,
  next: FollowUpStatus,
  actor: { userId: string | null; name: string },
  note?: string | null
): Promise<BodyCheckReport> {
  if (!FOLLOW_UP_STATUSES.includes(next)) throw new Error("Unknown follow-up status.");
  const current = await getBodyCheckReport(db, id);
  if (!current) throw new Error("Report not found.");
  if (current.report.followUpStatus === next) return current.report;
  const { error: eventError } = await db.from("body_check_follow_up_events").insert({
    report_id: id,
    from_status: current.report.followUpStatus,
    to_status: next,
    note: note?.trim() || null,
    changed_by: actor.userId,
    changed_by_name: actor.name
  });
  if (eventError) throw new Error(eventError.message);
  const { data, error } = await db
    .from("body_check_reports")
    .update({ follow_up_status: next })
    .eq("id", id)
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return mapReport(data as Record<string, unknown>);
}

export async function reportStats(
  db: Db,
  businessDate: string
): Promise<{ submittedToday: number; submittedAnimalIds: string[]; unresolvedFollowUps: number; followUpAnimalIds: string[] }> {
  const bounds = pacificDayBounds(businessDate);
  let submittedQuery = db.from("body_check_reports").select("gingr_animal_id");
  if (bounds) {
    submittedQuery = submittedQuery.gte("inspected_at", bounds.start).lte("inspected_at", bounds.end);
  }
  const submitted = await submittedQuery;
  if (submitted.error) throw new Error(submitted.error.message);
  const submittedAnimalIds = [...new Set((submitted.data ?? []).map((row) => String(row.gingr_animal_id)))];
  const { data, error } = await db
    .from("body_check_reports")
    .select("gingr_animal_id")
    .in("follow_up_status", ["required", "scheduled"]);
  if (error) throw new Error(error.message);
  const followUpAnimalIds = [...new Set((data ?? []).map((row) => String(row.gingr_animal_id)))];
  return {
    submittedToday: submitted.data?.length ?? 0,
    submittedAnimalIds,
    unresolvedFollowUps: followUpAnimalIds.length,
    followUpAnimalIds
  };
}
