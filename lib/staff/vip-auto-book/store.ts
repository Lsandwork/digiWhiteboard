type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import type {
  VipAutoBookClient,
  VipAutoBookListFilters,
  VipAutoBookSummary,
  VipCadence,
  VipClientStatus,
  VipDirectoryHit,
  VipServiceKind
} from "./types";

const SORTABLE: Record<string, string> = {
  owner_name: "owner_name",
  dog_name: "dog_name",
  service_kind: "service_kind",
  cadence: "cadence",
  status: "status",
  starts_on: "starts_on",
  updated_at: "updated_at",
  created_at: "created_at"
};

function asServiceKind(value: unknown): VipServiceKind {
  const text = String(value || "");
  if (
    text === "group_class" ||
    text === "adventure_hike" ||
    text === "beach_excursion" ||
    text === "trainer_led_hike" ||
    text === "taxi" ||
    text === "other"
  ) {
    return text;
  }
  return "other";
}

function asCadence(value: unknown): VipCadence {
  const text = String(value || "");
  if (text === "weekly" || text === "monthly" || text === "custom") return text;
  return "weekly";
}

function asStatus(value: unknown): VipClientStatus {
  const text = String(value || "");
  if (text === "active" || text === "paused" || text === "cancelled") return text;
  return "active";
}

function mapRow(row: Record<string, unknown>): VipAutoBookClient {
  const days = Array.isArray(row.days_of_week)
    ? row.days_of_week.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  return {
    id: String(row.id),
    fitdogOwnerId: row.fitdog_owner_id != null ? String(row.fitdog_owner_id) : null,
    fitdogDogId: row.fitdog_dog_id != null ? String(row.fitdog_dog_id) : null,
    ownerName: String(row.owner_name ?? ""),
    ownerEmail: row.owner_email != null ? String(row.owner_email) : null,
    ownerPhone: row.owner_phone != null ? String(row.owner_phone) : null,
    dogName: String(row.dog_name ?? ""),
    dogBreed: row.dog_breed != null ? String(row.dog_breed) : null,
    serviceKind: asServiceKind(row.service_kind),
    serviceName: String(row.service_name ?? ""),
    cadence: asCadence(row.cadence),
    daysOfWeek: days,
    monthlyWeek: row.monthly_week != null ? Number(row.monthly_week) : null,
    preferredTime: row.preferred_time != null ? String(row.preferred_time) : null,
    timezone: String(row.timezone ?? "America/Los_Angeles"),
    startsOn: String(row.starts_on ?? "").slice(0, 10),
    endsOn: row.ends_on != null ? String(row.ends_on).slice(0, 10) : null,
    status: asStatus(row.status),
    notes: String(row.notes ?? ""),
    lastVerifiedAt: row.last_verified_at != null ? String(row.last_verified_at) : null,
    lastBookedFor: row.last_booked_for != null ? String(row.last_booked_for).slice(0, 10) : null,
    lastBookStatus: row.last_book_status != null ? String(row.last_book_status) : null,
    lastBookError: row.last_book_error != null ? String(row.last_book_error) : null,
    createdByUserId: row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    createdByName: row.created_by_name != null ? String(row.created_by_name) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

function pacificToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

export async function listVipAutoBookClients(supabase: SupabaseClient, filters: VipAutoBookListFilters = {}) {
  const page = Math.max(1, Number(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 50)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = SORTABLE[filters.sortBy ?? "updated_at"] ?? "updated_at";
  const ascending = filters.sortDir === "asc";

  let query = supabase.from("vip_auto_book_clients").select("*", { count: "exact" });
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.cadence && filters.cadence !== "all") query = query.eq("cadence", filters.cadence);
  if (filters.serviceKind && filters.serviceKind !== "all") query = query.eq("service_kind", filters.serviceKind);
  if (filters.q?.trim()) {
    const term = filters.q.trim().replace(/,/g, "");
    query = query.or(
      `dog_name.ilike.%${term}%,owner_name.ilike.%${term}%,service_name.ilike.%${term}%,notes.ilike.%${term}%,owner_email.ilike.%${term}%`
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

export async function getVipAutoBookSummary(supabase: SupabaseClient): Promise<VipAutoBookSummary> {
  const { data, error } = await supabase.from("vip_auto_book_clients").select("status, cadence").limit(10_000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  let active = 0;
  let paused = 0;
  let weekly = 0;
  let monthly = 0;
  for (const row of rows) {
    if (row.status === "active") active += 1;
    if (row.status === "paused") paused += 1;
    if (row.cadence === "weekly") weekly += 1;
    if (row.cadence === "monthly") monthly += 1;
  }
  return { total: rows.length, active, paused, weekly, monthly };
}

export async function createVipAutoBookClient(
  supabase: SupabaseClient,
  input: {
    fitdogOwnerId?: string | null;
    fitdogDogId?: string | null;
    ownerName: string;
    ownerEmail?: string | null;
    ownerPhone?: string | null;
    dogName: string;
    dogBreed?: string | null;
    serviceKind?: VipServiceKind;
    serviceName?: string;
    cadence?: VipCadence;
    daysOfWeek?: number[];
    monthlyWeek?: number | null;
    preferredTime?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
    notes?: string;
    createdByUserId?: string | null;
    createdByName?: string | null;
  }
) {
  const ownerName = String(input.ownerName ?? "").trim();
  const dogName = String(input.dogName ?? "").trim();
  if (!ownerName) throw new Error("Owner name is required.");
  if (!dogName) throw new Error("Dog name is required.");

  const days = (input.daysOfWeek ?? [])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  const { data, error } = await supabase
    .from("vip_auto_book_clients")
    .insert({
      fitdog_owner_id: input.fitdogOwnerId?.trim() || null,
      fitdog_dog_id: input.fitdogDogId?.trim() || null,
      owner_name: ownerName,
      owner_email: input.ownerEmail?.trim() || null,
      owner_phone: input.ownerPhone?.trim() || null,
      dog_name: dogName,
      dog_breed: input.dogBreed?.trim() || null,
      service_kind: asServiceKind(input.serviceKind),
      service_name: String(input.serviceName ?? "").trim(),
      cadence: asCadence(input.cadence),
      days_of_week: days,
      monthly_week: input.monthlyWeek ?? null,
      preferred_time: input.preferredTime?.trim() || null,
      starts_on: input.startsOn?.trim() || pacificToday(),
      ends_on: input.endsOn?.trim() || null,
      status: "active",
      notes: String(input.notes ?? "").trim(),
      created_by_user_id: input.createdByUserId ?? null,
      created_by_name: input.createdByName ?? null
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function updateVipAutoBookClient(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    ownerName: string;
    ownerEmail: string | null;
    ownerPhone: string | null;
    dogName: string;
    dogBreed: string | null;
    serviceKind: VipServiceKind;
    serviceName: string;
    cadence: VipCadence;
    daysOfWeek: number[];
    monthlyWeek: number | null;
    preferredTime: string | null;
    startsOn: string;
    endsOn: string | null;
    status: VipClientStatus;
    notes: string;
    lastVerifiedAt: string | null;
    lastBookedFor: string | null;
    lastBookStatus: string | null;
    lastBookError: string | null;
  }>
) {
  const update: Record<string, unknown> = {};
  if (patch.ownerName !== undefined) update.owner_name = String(patch.ownerName).trim();
  if (patch.ownerEmail !== undefined) update.owner_email = patch.ownerEmail?.trim() || null;
  if (patch.ownerPhone !== undefined) update.owner_phone = patch.ownerPhone?.trim() || null;
  if (patch.dogName !== undefined) update.dog_name = String(patch.dogName).trim();
  if (patch.dogBreed !== undefined) update.dog_breed = patch.dogBreed?.trim() || null;
  if (patch.serviceKind !== undefined) update.service_kind = asServiceKind(patch.serviceKind);
  if (patch.serviceName !== undefined) update.service_name = String(patch.serviceName).trim();
  if (patch.cadence !== undefined) update.cadence = asCadence(patch.cadence);
  if (patch.daysOfWeek !== undefined) {
    update.days_of_week = patch.daysOfWeek
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  }
  if (patch.monthlyWeek !== undefined) update.monthly_week = patch.monthlyWeek;
  if (patch.preferredTime !== undefined) update.preferred_time = patch.preferredTime?.trim() || null;
  if (patch.startsOn !== undefined) update.starts_on = patch.startsOn;
  if (patch.endsOn !== undefined) update.ends_on = patch.endsOn;
  if (patch.status !== undefined) update.status = asStatus(patch.status);
  if (patch.notes !== undefined) update.notes = String(patch.notes).trim();
  if (patch.lastVerifiedAt !== undefined) update.last_verified_at = patch.lastVerifiedAt;
  if (patch.lastBookedFor !== undefined) update.last_booked_for = patch.lastBookedFor;
  if (patch.lastBookStatus !== undefined) update.last_book_status = patch.lastBookStatus;
  if (patch.lastBookError !== undefined) update.last_book_error = patch.lastBookError;

  const { data, error } = await supabase
    .from("vip_auto_book_clients")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}

export async function searchVipDirectory(
  supabase: SupabaseClient,
  query: string,
  limit = 12
): Promise<VipDirectoryHit[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const safe = term.replace(/,/g, "");
  const pageSize = Math.min(25, Math.max(5, limit));

  const [dogs, customers, vip] = await Promise.all([
    supabase
      .from("fitdog_dogs")
      .select("fitdog_dog_id, fitdog_owner_id, dog_name, breed")
      .or(`dog_name.ilike.%${safe}%`)
      .order("dog_name", { ascending: true })
      .limit(pageSize),
    supabase
      .from("fitdog_customers")
      .select("fitdog_owner_id, owner_name, email, phone")
      .or(`owner_name.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order("owner_name", { ascending: true })
      .limit(pageSize),
    supabase
      .from("vip_auto_book_clients")
      .select("fitdog_owner_id, fitdog_dog_id, owner_name, owner_email, owner_phone, dog_name, dog_breed")
      .or(`dog_name.ilike.%${safe}%,owner_name.ilike.%${safe}%`)
      .limit(pageSize)
  ]);

  if (dogs.error) throw new Error(dogs.error.message);
  if (customers.error) throw new Error(customers.error.message);
  if (vip.error) throw new Error(vip.error.message);

  const ownerById = new Map(
    (customers.data ?? []).map((row) => [
      String(row.fitdog_owner_id),
      {
        ownerName: String(row.owner_name ?? ""),
        ownerEmail: row.email != null ? String(row.email) : null,
        ownerPhone: row.phone != null ? String(row.phone) : null
      }
    ])
  );

  const hits: VipDirectoryHit[] = [];
  const seen = new Set<string>();

  for (const row of dogs.data ?? []) {
    const ownerId = row.fitdog_owner_id != null ? String(row.fitdog_owner_id) : null;
    const owner = ownerId ? ownerById.get(ownerId) : null;
    const key = `${ownerId || ""}:${row.fitdog_dog_id}:${row.dog_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      fitdogOwnerId: ownerId,
      fitdogDogId: String(row.fitdog_dog_id),
      ownerName: owner?.ownerName || "",
      ownerEmail: owner?.ownerEmail || null,
      ownerPhone: owner?.ownerPhone || null,
      dogName: String(row.dog_name ?? ""),
      dogBreed: row.breed != null ? String(row.breed) : null,
      source: "fitdog_directory"
    });
  }

  // Owner-only matches (no dog yet in directory) still help typing.
  for (const row of customers.data ?? []) {
    const ownerId = String(row.fitdog_owner_id);
    const key = `${ownerId}::`;
    if (seen.has(key)) continue;
    if (hits.some((hit) => hit.fitdogOwnerId === ownerId && hit.dogName)) continue;
    seen.add(key);
    hits.push({
      fitdogOwnerId: ownerId,
      fitdogDogId: null,
      ownerName: String(row.owner_name ?? ""),
      ownerEmail: row.email != null ? String(row.email) : null,
      ownerPhone: row.phone != null ? String(row.phone) : null,
      dogName: "",
      dogBreed: null,
      source: "fitdog_directory"
    });
  }

  for (const row of vip.data ?? []) {
    const key = `${row.fitdog_owner_id || ""}:${row.fitdog_dog_id || ""}:${row.dog_name}:${row.owner_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      fitdogOwnerId: row.fitdog_owner_id != null ? String(row.fitdog_owner_id) : null,
      fitdogDogId: row.fitdog_dog_id != null ? String(row.fitdog_dog_id) : null,
      ownerName: String(row.owner_name ?? ""),
      ownerEmail: row.owner_email != null ? String(row.owner_email) : null,
      ownerPhone: row.owner_phone != null ? String(row.owner_phone) : null,
      dogName: String(row.dog_name ?? ""),
      dogBreed: row.dog_breed != null ? String(row.dog_breed) : null,
      source: "vip_list"
    });
  }

  return hits
    .filter((hit) => hit.ownerName || hit.dogName)
    .slice(0, limit);
}
