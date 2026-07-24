type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { createOwnerFollowUp, dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import { centsToDisplay, parseMoneyToCents } from "./money";
import type {
  VetVisit,
  VetVisitListFilters,
  VetVisitManagementStatus,
  VetVisitOwnerFollowUpStatus,
  VetVisitPaidBy,
  VetVisitSummary
} from "./types";

const SORTABLE: Record<string, string> = {
  occurred_at: "occurred_at",
  visit_number: "visit_number",
  dog_name: "dog_name",
  owner_name: "owner_name",
  reason: "reason",
  vet_clinic: "vet_clinic",
  reported_by: "reported_by",
  bill_total_cents: "bill_total_cents",
  paid_by: "paid_by",
  owner_follow_up_status: "owner_follow_up_status",
  management_status: "management_status",
  assigned_to_name: "assigned_to_name",
  created_at: "created_at",
  updated_at: "updated_at"
};

function mapRow(row: Record<string, unknown>): VetVisit {
  return {
    id: String(row.id),
    visit_number: String(row.visit_number ?? ""),
    occurred_at: String(row.occurred_at ?? ""),
    dog_name: String(row.dog_name ?? ""),
    dog_breed: row.dog_breed != null ? String(row.dog_breed) : null,
    owner_name: String(row.owner_name ?? ""),
    reason: String(row.reason ?? ""),
    vet_clinic: String(row.vet_clinic ?? ""),
    reported_by: String(row.reported_by ?? ""),
    reported_by_user_id: row.reported_by_user_id != null ? String(row.reported_by_user_id) : null,
    receipt_url: row.receipt_url != null ? String(row.receipt_url) : null,
    receipt_label: row.receipt_label != null ? String(row.receipt_label) : null,
    bill_total_cents: Number(row.bill_total_cents ?? 0),
    paid_by: row.paid_by === "owner" ? "owner" : "fitdog",
    owner_follow_up_status: (row.owner_follow_up_status as VetVisitOwnerFollowUpStatus) || "pending",
    owner_follow_up_due_at: row.owner_follow_up_due_at != null ? String(row.owner_follow_up_due_at) : null,
    owner_follow_up_completed_at:
      row.owner_follow_up_completed_at != null ? String(row.owner_follow_up_completed_at) : null,
    management_status: row.management_status === "resolved" ? "resolved" : "in_progress",
    assigned_to_user_id: row.assigned_to_user_id != null ? String(row.assigned_to_user_id) : null,
    assigned_to_name: row.assigned_to_name != null ? String(row.assigned_to_name) : null,
    linked_owner_follow_up_id:
      row.linked_owner_follow_up_id != null ? String(row.linked_owner_follow_up_id) : null,
    notes: String(row.notes ?? ""),
    latest_update: row.latest_update != null ? String(row.latest_update) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null
  };
}

function defaultFollowUpDueDate(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function listVetVisits(supabase: SupabaseClient, filters: VetVisitListFilters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 25)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = SORTABLE[filters.sortBy ?? "occurred_at"] ?? "occurred_at";
  const ascending = filters.sortDir === "asc";

  let query = supabase.from("vet_visits").select("*", { count: "exact" });
  if (filters.managementStatus && filters.managementStatus !== "all") {
    query = query.eq("management_status", filters.managementStatus);
  }
  if (filters.ownerFollowUp && filters.ownerFollowUp !== "all") {
    query = query.eq("owner_follow_up_status", filters.ownerFollowUp);
  }
  if (filters.dateFrom) query = query.gte("occurred_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("occurred_at", `${filters.dateTo}T23:59:59.999Z`);
  if (filters.q?.trim()) {
    const term = filters.q.trim().replace(/,/g, "");
    query = query.or(
      `dog_name.ilike.%${term}%,owner_name.ilike.%${term}%,reason.ilike.%${term}%,vet_clinic.ilike.%${term}%,visit_number.ilike.%${term}%,reported_by.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query.order(sortBy, { ascending, nullsFirst: false }).range(from, to);
  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize
  };
}

export async function getVetVisitSummary(supabase: SupabaseClient): Promise<VetVisitSummary> {
  const { data, error } = await supabase
    .from("vet_visits")
    .select("management_status, owner_follow_up_status")
    .limit(10_000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let inProgress = 0;
  let resolved = 0;
  let followUpRequired = 0;
  for (const row of rows) {
    if (row.management_status === "resolved") resolved += 1;
    else inProgress += 1;
    if (row.owner_follow_up_status !== "completed") followUpRequired += 1;
  }
  return { total: rows.length, inProgress, resolved, followUpRequired };
}

export async function createVetVisit(
  supabase: SupabaseClient,
  input: {
    dog_name: string;
    dog_breed?: string | null;
    owner_name: string;
    reason: string;
    vet_clinic?: string;
    reported_by: string;
    reported_by_user_id?: string | null;
    occurred_at?: string | null;
    receipt_url?: string | null;
    bill_total?: unknown;
    paid_by?: VetVisitPaidBy;
    assigned_to_name?: string | null;
    notes?: string;
    create_owner_follow_up?: boolean;
  },
  actor: string | null
) {
  const dog = String(input.dog_name ?? "").trim();
  const owner = String(input.owner_name ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  if (!dog) throw new Error("Dog name is required.");
  if (!owner) throw new Error("Owner name is required.");
  if (!reason) throw new Error("Reason is required.");

  const occurredAt = input.occurred_at ? new Date(input.occurred_at).toISOString() : new Date().toISOString();
  const year = new Date(occurredAt).getUTCFullYear();
  const suffix = Date.now().toString().slice(-6);
  const visitNumber = `VV-${year}-${suffix}`;
  const followUpDue = defaultFollowUpDueDate(new Date(occurredAt));
  const billCents = parseMoneyToCents(input.bill_total);
  const paidBy: VetVisitPaidBy = input.paid_by === "owner" ? "owner" : "fitdog";

  const { data, error } = await supabase
    .from("vet_visits")
    .insert({
      visit_number: visitNumber,
      occurred_at: occurredAt,
      dog_name: dog,
      dog_breed: input.dog_breed?.trim() || null,
      owner_name: owner,
      reason,
      vet_clinic: String(input.vet_clinic ?? "").trim(),
      reported_by: String(input.reported_by ?? "").trim() || actor || "Staff",
      reported_by_user_id: input.reported_by_user_id ?? null,
      receipt_url: input.receipt_url?.trim() || null,
      receipt_label: input.receipt_url?.trim() ? "View PDF" : null,
      bill_total_cents: billCents,
      paid_by: paidBy,
      owner_follow_up_status: "due",
      owner_follow_up_due_at: followUpDue,
      management_status: "in_progress",
      assigned_to_name: input.assigned_to_name?.trim() || "Management",
      notes: String(input.notes ?? "").trim(),
      latest_update: `Vet visit logged by ${actor ?? "staff"}`
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  let record = mapRow(data as Record<string, unknown>);

  // Always open an Owner Follow Up — management must contact the owner after every vet visit.
  if (input.create_owner_follow_up !== false) {
    try {
      const followUp = await createOwnerFollowUp(
        supabase,
        {
          subject: `Vet visit follow-up: ${dog}`,
          owner_name: owner,
          dog_name: dog,
          assigned_to: record.assigned_to_name || "Management",
          priority: "High",
          due_date: followUpDue,
          follow_up_notes: `Required owner outreach after vet visit ${visitNumber}. Reason: ${reason}. Clinic: ${record.vet_clinic || "—"}. Bill: ${centsToDisplay(billCents)} (${paidBy}).`,
          source: "Vet Visits",
          source_id: record.id,
          urgent: true
        },
        actor
      );
      const { data: linked, error: linkError } = await supabase
        .from("vet_visits")
        .update({
          linked_owner_follow_up_id: followUp.id,
          latest_update: `Owner follow-up created (${followUp.id.slice(0, 8)})`
        })
        .eq("id", record.id)
        .select("*")
        .single();
      if (!linkError && linked) record = mapRow(linked as Record<string, unknown>);
    } catch {
      // Visit remains even if follow-up creation fails; alert still fires below.
    }
  }

  await dispatchStaffOpsNotificationEvent(supabase, {
    eventType: "created",
    sourceTable: "vet_visits",
    sourceId: record.id,
    sourceTab: "vet_visits",
    title: `Vet visit: ${dog} — ${reason}`,
    body: `${owner} · ${record.vet_clinic || "Clinic TBD"} · Bill ${centsToDisplay(billCents)} (${paidBy}). Management owner follow-up required by ${followUpDue}.`,
    priority: "High",
    urgent: true,
    needsManagementReview: true,
    assignedTo: record.assigned_to_name,
    actor
  });

  return record;
}

export async function updateVetVisit(
  supabase: SupabaseClient,
  id: string,
  patch: {
    management_status?: VetVisitManagementStatus;
    owner_follow_up_status?: VetVisitOwnerFollowUpStatus;
    assigned_to_name?: string | null;
    receipt_url?: string | null;
    bill_total?: unknown;
    paid_by?: VetVisitPaidBy;
    notes?: string;
    latest_update?: string | null;
    vet_clinic?: string;
    reason?: string;
  },
  actor: string | null
) {
  const updates: Record<string, unknown> = {};
  if (patch.management_status) {
    updates.management_status = patch.management_status;
    updates.resolved_at = patch.management_status === "resolved" ? new Date().toISOString() : null;
  }
  if (patch.owner_follow_up_status) {
    updates.owner_follow_up_status = patch.owner_follow_up_status;
    updates.owner_follow_up_completed_at =
      patch.owner_follow_up_status === "completed" ? new Date().toISOString() : null;
  }
  if (patch.assigned_to_name !== undefined) updates.assigned_to_name = patch.assigned_to_name;
  if (patch.receipt_url !== undefined) {
    updates.receipt_url = patch.receipt_url;
    updates.receipt_label = patch.receipt_url ? "View PDF" : null;
  }
  if (patch.bill_total !== undefined) updates.bill_total_cents = parseMoneyToCents(patch.bill_total);
  if (patch.paid_by) updates.paid_by = patch.paid_by;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.vet_clinic !== undefined) updates.vet_clinic = patch.vet_clinic;
  if (patch.reason !== undefined) updates.reason = patch.reason;
  updates.latest_update =
    patch.latest_update ??
    `Updated by ${actor ?? "staff"} · ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`;

  const { data, error } = await supabase.from("vet_visits").update(updates).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  const record = mapRow(data as Record<string, unknown>);

  if (patch.management_status === "resolved" || patch.owner_follow_up_status === "completed") {
    await dispatchStaffOpsNotificationEvent(supabase, {
      eventType: "updated",
      sourceTable: "vet_visits",
      sourceId: record.id,
      sourceTab: "vet_visits",
      title: `Vet visit updated: ${record.visit_number}`,
      body: `Management: ${record.management_status.replace(/_/g, " ")} · Owner follow-up: ${record.owner_follow_up_status}`,
      priority: "Medium",
      needsManagementReview: record.management_status !== "resolved",
      assignedTo: record.assigned_to_name,
      actor
    });
  }

  return record;
}
