import JSZip from "jszip";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { loadActiveDogsForGroomingPush } from "@/lib/grooming-push-active-dogs";
import { deriveItemStatus, buildExportFileName } from "@/lib/photo-upload-queue/process";
import {
  buildPhotoStoragePath,
  createPhotoSignedUrl,
  downloadPhotoBuffer,
  uploadPhotoBuffer
} from "@/lib/photo-upload-queue/storage";
import type {
  PhotoAssignmentSource,
  PhotoBatchCounts,
  PhotoBatchStatus,
  PhotoItemStatus,
  PhotoUploadBatch,
  PhotoUploadCheckedInDog,
  PhotoUploadDogAssignment,
  PhotoUploadExport,
  PhotoUploadItem,
  PhotoUploadOption
} from "@/lib/photo-upload-queue/types";
import { suggestedBatchName } from "@/lib/photo-upload-queue/types";
import { pacificDateKey } from "@/lib/staff/front-desk-log";
import type { getServiceSupabase } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof getServiceSupabase>;

export type PhotoQueueActor = {
  id?: string | null;
  name: string;
  email?: string | null;
};

type AuditInput = {
  batchId: string;
  photoItemId?: string | null;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  performedBy?: string | null;
  performedByName?: string | null;
};

const EMPTY_COUNTS: PhotoBatchCounts = {
  total: 0,
  processing: 0,
  needs_dog_assignment: 0,
  needs_review: 0,
  ready_for_gingr: 0,
  included_in_export: 0,
  uploaded_to_gingr: 0,
  excluded: 0,
  failed: 0
};

const LOCKED_BATCH_STATUSES = new Set<PhotoBatchStatus>(["uploaded_to_gingr", "archived"]);

function actorId(actor: PhotoQueueActor) {
  return normalizeAdminUserId(actor.id);
}

function actorName(actor: PhotoQueueActor) {
  return actor.name?.trim() || actor.email?.trim() || "Staff";
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pacificDayBounds(serviceDate: string) {
  // Pacific midnight → next midnight expressed as UTC ISO bounds for timestamptz filters.
  const start = new Date(`${serviceDate}T00:00:00-07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  // Prefer DST-aware bounds via Intl when possible; fallback above is PDT-ish.
  try {
    const probe = new Date(`${serviceDate}T12:00:00Z`);
    const offsetParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "shortOffset"
    }).formatToParts(probe);
    const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-7";
    const match = tzName.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (match) {
      const hours = Number(match[1]);
      const mins = Number(match[2] ?? 0);
      const offsetMs = (hours * 60 + Math.sign(hours) * mins) * 60 * 1000;
      const utcStart = new Date(Date.parse(`${serviceDate}T00:00:00.000Z`) - offsetMs);
      return {
        startIso: utcStart.toISOString(),
        endIso: new Date(utcStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
      };
    }
  } catch {
    // fall through
  }
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function writeAudit(supabase: SupabaseClient, input: AuditInput) {
  const { error } = await supabase.from("photo_upload_audit_log").insert({
    batch_id: input.batchId,
    photo_item_id: input.photoItemId ?? null,
    action: input.action,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    performed_by: normalizeAdminUserId(input.performedBy),
    performed_by_name: input.performedByName ?? null
  });
  if (error) {
    console.error("[photo-upload-queue] audit write failed", error.message);
  }
}

export async function countBatchItems(supabase: SupabaseClient, batchId: string): Promise<PhotoBatchCounts> {
  const { data, error } = await supabase.from("photo_upload_items").select("status").eq("batch_id", batchId);
  if (error) throw new Error(error.message || "Unable to count batch items.");

  const counts: PhotoBatchCounts = { ...EMPTY_COUNTS };
  for (const row of data ?? []) {
    const status = String(row.status) as PhotoItemStatus;
    counts.total += 1;
    if (status in counts) {
      counts[status as keyof Omit<PhotoBatchCounts, "total">] += 1;
    }
  }
  return counts;
}

function deriveBatchStatus(counts: PhotoBatchCounts, current?: PhotoBatchStatus | null): PhotoBatchStatus {
  if (current === "archived") return "archived";
  if (counts.total === 0) return "draft";
  if (counts.processing > 0) return "processing";

  const terminal =
    counts.excluded + counts.failed + counts.uploaded_to_gingr + counts.included_in_export + counts.ready_for_gingr;
  const blocking = counts.needs_dog_assignment + counts.needs_review;

  if (blocking > 0) return "needs_review";

  if (counts.uploaded_to_gingr > 0) {
    const remainingActive =
      counts.total - counts.excluded - counts.failed - counts.uploaded_to_gingr;
    if (remainingActive <= 0) return "uploaded_to_gingr";
    return "partially_uploaded";
  }

  if (counts.included_in_export > 0) {
    const notYetExported =
      counts.ready_for_gingr + counts.needs_dog_assignment + counts.needs_review + counts.processing;
    if (notYetExported <= 0 || counts.included_in_export + counts.excluded + counts.failed >= counts.total) {
      return "exported";
    }
    return "exported";
  }

  if (counts.ready_for_gingr > 0 && blocking === 0) return "ready";
  if (terminal >= counts.total && counts.ready_for_gingr === 0 && counts.included_in_export === 0) {
    return counts.failed === counts.total ? "needs_review" : "draft";
  }
  return "draft";
}

export async function refreshBatchStatus(supabase: SupabaseClient, batchId: string) {
  const [{ data: batch, error: batchError }, counts] = await Promise.all([
    supabase.from("photo_upload_batches").select("id, status").eq("id", batchId).maybeSingle(),
    countBatchItems(supabase, batchId)
  ]);
  if (batchError) throw new Error(batchError.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");

  const nextStatus = deriveBatchStatus(counts, batch.status as PhotoBatchStatus);
  if (nextStatus !== batch.status) {
    const { error } = await supabase
      .from("photo_upload_batches")
      .update({ status: nextStatus })
      .eq("id", batchId);
    if (error) throw new Error(error.message || "Unable to refresh batch status.");
  }
  return { status: nextStatus, counts };
}

export async function listCategories(supabase: SupabaseClient): Promise<PhotoUploadOption[]> {
  const { data, error } = await supabase
    .from("photo_upload_categories")
    .select("id, key, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load categories.");
  return (data ?? []) as PhotoUploadOption[];
}

export async function listYards(supabase: SupabaseClient): Promise<PhotoUploadOption[]> {
  const { data, error } = await supabase
    .from("photo_upload_yards")
    .select("id, key, label, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load yards.");
  return (data ?? []) as PhotoUploadOption[];
}

export async function createBatch(
  supabase: SupabaseClient,
  input: {
    batch_name?: string;
    service_date: string;
    photographer_name: string;
    photographer_user_id?: string | null;
    default_yard?: string;
    default_category?: string;
    internal_note?: string | null;
  },
  actor: PhotoQueueActor
) {
  const serviceDate = String(input.service_date || "").trim();
  if (!isDateOnly(serviceDate)) throw new Error("service_date must be YYYY-MM-DD.");
  const photographer = String(input.photographer_name || "").trim();
  if (!photographer) throw new Error("Photographer name is required.");

  const batchName =
    String(input.batch_name || "").trim() || suggestedBatchName(serviceDate, photographer);

  const row = {
    batch_name: batchName,
    service_date: serviceDate,
    photographer_name: photographer,
    photographer_user_id: normalizeAdminUserId(input.photographer_user_id) ?? actorId(actor),
    default_yard: String(input.default_yard || "big_side").trim() || "big_side",
    default_category: String(input.default_category || "daycare").trim() || "daycare",
    internal_note: input.internal_note?.trim() || null,
    status: "draft" as PhotoBatchStatus,
    created_by: actorId(actor),
    created_by_name: actorName(actor)
  };

  const { data, error } = await supabase.from("photo_upload_batches").insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message || "Unable to create batch.");

  await writeAudit(supabase, {
    batchId: data.id,
    action: "batch.created",
    newValue: row,
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  return { ...(data as PhotoUploadBatch), counts: { ...EMPTY_COUNTS } };
}

export async function listBatches(
  supabase: SupabaseClient,
  filters: {
    status?: string | null;
    service_date?: string | null;
    search?: string | null;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("photo_upload_batches")
    .select("*", { count: "exact" })
    .order("service_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status?.trim()) query = query.eq("status", filters.status.trim());
  if (filters.service_date?.trim()) query = query.eq("service_date", filters.service_date.trim());
  if (filters.search?.trim()) {
    const q = filters.search.trim().replace(/%/g, "");
    query = query.or(`batch_name.ilike.%${q}%,photographer_name.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message || "Unable to list batches.");

  const batches = (data ?? []) as PhotoUploadBatch[];
  const withCounts = await Promise.all(
    batches.map(async (batch) => ({
      ...batch,
      counts: await countBatchItems(supabase, batch.id)
    }))
  );

  return {
    batches: withCounts,
    total: count ?? withCounts.length,
    page,
    pageSize
  };
}

async function loadDogsForItems(supabase: SupabaseClient, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, PhotoUploadDogAssignment[]>();
  const { data, error } = await supabase
    .from("photo_upload_item_dogs")
    .select("*")
    .in("photo_item_id", itemIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message || "Unable to load dog assignments.");

  const map = new Map<string, PhotoUploadDogAssignment[]>();
  for (const row of (data ?? []) as PhotoUploadDogAssignment[]) {
    const list = map.get(row.photo_item_id) ?? [];
    list.push(row);
    map.set(row.photo_item_id, list);
  }
  return map;
}

async function attachDuplicateInfo(
  supabase: SupabaseClient,
  items: PhotoUploadItem[]
): Promise<PhotoUploadItem[]> {
  const dupIds = [
    ...new Set(items.map((i) => i.duplicate_of_item_id).filter(Boolean) as string[])
  ];
  if (!dupIds.length) return items.map((i) => ({ ...i, duplicate_info: null }));

  const { data, error } = await supabase
    .from("photo_upload_items")
    .select(
      "id, original_filename, status, uploaded_to_gingr_at, batch_id, photo_upload_batches!inner(batch_name, service_date)"
    )
    .in("id", dupIds);
  if (error) {
    console.error("[photo-upload-queue] duplicate info load failed", error.message);
    return items.map((i) => ({ ...i, duplicate_info: null }));
  }

  const infoMap = new Map<
    string,
    NonNullable<PhotoUploadItem["duplicate_info"]>
  >();
  for (const row of data ?? []) {
    const batch = (row as { photo_upload_batches?: { batch_name?: string; service_date?: string } })
      .photo_upload_batches;
    infoMap.set(String((row as { id: string }).id), {
      previous_batch_name: batch?.batch_name ?? null,
      previous_filename: String((row as { original_filename?: string }).original_filename ?? null),
      previous_uploaded_at: (row as { uploaded_to_gingr_at?: string | null }).uploaded_to_gingr_at ?? null,
      previous_status: String((row as { status?: string }).status ?? null),
      previous_service_date: batch?.service_date ?? null
    });
  }

  return items.map((item) => ({
    ...item,
    duplicate_info: item.duplicate_of_item_id ? infoMap.get(item.duplicate_of_item_id) ?? null : null
  }));
}

export async function getBatchDetail(supabase: SupabaseClient, batchId: string) {
  const { data: batch, error } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");

  const { data: itemRows, error: itemsError } = await supabase
    .from("photo_upload_items")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (itemsError) throw new Error(itemsError.message || "Unable to load batch items.");

  const rawItems = (itemRows ?? []) as PhotoUploadItem[];
  const dogMap = await loadDogsForItems(
    supabase,
    rawItems.map((i) => i.id)
  );
  const withDupes = await attachDuplicateInfo(supabase, rawItems);

  const items = await Promise.all(
    withDupes.map(async (item) => ({
      ...item,
      dogs: dogMap.get(item.id) ?? [],
      thumbnail_url: await createPhotoSignedUrl(supabase, item.thumbnail_storage_path),
      original_url: await createPhotoSignedUrl(supabase, item.original_storage_path)
    }))
  );

  const counts = await countBatchItems(supabase, batchId);

  const { data: exports } = await supabase
    .from("photo_upload_exports")
    .select("*")
    .eq("batch_id", batchId)
    .order("export_number", { ascending: false });

  const exportRows = await Promise.all(
    ((exports ?? []) as PhotoUploadExport[]).map(async (row) => ({
      ...row,
      zip_url: await createPhotoSignedUrl(supabase, row.zip_storage_path)
    }))
  );

  return {
    batch: { ...(batch as PhotoUploadBatch), counts, items },
    exports: exportRows
  };
}

export async function findDuplicateByHash(
  supabase: SupabaseClient,
  sha256: string,
  excludeItemId?: string | null
) {
  let query = supabase
    .from("photo_upload_items")
    .select(
      "id, batch_id, original_filename, status, uploaded_to_gingr_at, created_at, photo_upload_batches!inner(batch_name, service_date, status)"
    )
    .eq("sha256_hash", sha256)
    .neq("status", "excluded")
    .order("created_at", { ascending: false })
    .limit(5);

  if (excludeItemId) query = query.neq("id", excludeItemId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Unable to check for duplicates.");
  const match = (data ?? [])[0];
  if (!match) return null;

  const batch = (match as { photo_upload_batches?: { batch_name?: string; service_date?: string; status?: string } })
    .photo_upload_batches;
  return {
    id: String((match as { id: string }).id),
    batch_id: String((match as { batch_id: string }).batch_id),
    original_filename: String((match as { original_filename: string }).original_filename),
    status: String((match as { status: string }).status),
    uploaded_to_gingr_at: (match as { uploaded_to_gingr_at?: string | null }).uploaded_to_gingr_at ?? null,
    batch_name: batch?.batch_name ?? null,
    service_date: batch?.service_date ?? null,
    batch_status: batch?.status ?? null
  };
}

export async function addPhotoItem(
  supabase: SupabaseClient,
  input: {
    batchId: string;
    original_filename: string;
    stored_filename: string;
    original_storage_path: string;
    thumbnail_storage_path: string | null;
    gingr_ready_storage_path: string | null;
    mime_type: string | null;
    file_size: number | null;
    width: number | null;
    height: number | null;
    sha256_hash: string;
    yard?: string | null;
    category?: string | null;
    photographer_name?: string | null;
    internal_note?: string | null;
  },
  actor: PhotoQueueActor
) {
  const { data: batch, error: batchError } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", input.batchId)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");
  if (LOCKED_BATCH_STATUSES.has(batch.status as PhotoBatchStatus)) {
    throw new Error("This batch is locked. Reopen it before adding photos.");
  }

  const duplicate = await findDuplicateByHash(supabase, input.sha256_hash);
  const hasDuplicate = Boolean(duplicate);
  const status = deriveItemStatus({
    dogCount: 0,
    hasDuplicate,
    duplicateOverride: false,
    excluded: false
  });

  const row = {
    batch_id: input.batchId,
    original_filename: input.original_filename,
    stored_filename: input.stored_filename,
    original_storage_path: input.original_storage_path,
    thumbnail_storage_path: input.thumbnail_storage_path,
    gingr_ready_storage_path: input.gingr_ready_storage_path,
    mime_type: input.mime_type,
    file_size: input.file_size,
    width: input.width,
    height: input.height,
    sha256_hash: input.sha256_hash,
    yard: input.yard ?? batch.default_yard ?? null,
    category: input.category ?? batch.default_category ?? null,
    photographer_name: input.photographer_name ?? batch.photographer_name ?? null,
    internal_note: input.internal_note ?? null,
    status,
    duplicate_of_item_id: duplicate?.id ?? null,
    duplicate_override: false
  };

  const { data, error } = await supabase.from("photo_upload_items").insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message || "Unable to save photo item.");

  await writeAudit(supabase, {
    batchId: input.batchId,
    photoItemId: data.id,
    action: "item.added",
    newValue: { filename: input.original_filename, status, duplicate_of: duplicate?.id ?? null },
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  await refreshBatchStatus(supabase, input.batchId);

  const thumbnail_url = await createPhotoSignedUrl(supabase, data.thumbnail_storage_path);
  return {
    item: {
      ...(data as PhotoUploadItem),
      dogs: [],
      thumbnail_url,
      duplicate_info: duplicate
        ? {
            previous_batch_name: duplicate.batch_name,
            previous_filename: duplicate.original_filename,
            previous_uploaded_at: duplicate.uploaded_to_gingr_at,
            previous_status: duplicate.status,
            previous_service_date: duplicate.service_date
          }
        : null
    } as PhotoUploadItem,
    duplicate
  };
}

async function recomputeItemStatus(
  supabase: SupabaseClient,
  item: PhotoUploadItem,
  dogCount?: number
) {
  let count = dogCount;
  if (count == null) {
    const { count: c, error } = await supabase
      .from("photo_upload_item_dogs")
      .select("id", { count: "exact", head: true })
      .eq("photo_item_id", item.id);
    if (error) throw new Error(error.message || "Unable to count dogs.");
    count = c ?? 0;
  }

  return deriveItemStatus({
    dogCount: count,
    hasDuplicate: Boolean(item.duplicate_of_item_id),
    duplicateOverride: Boolean(item.duplicate_override),
    excluded: item.status === "excluded",
    failed: item.status === "failed",
    alreadyExported: item.status === "included_in_export",
    alreadyUploaded: item.status === "uploaded_to_gingr"
  });
}

export async function updatePhotoItem(
  supabase: SupabaseClient,
  itemId: string,
  patch: {
    yard?: string | null;
    category?: string | null;
    internal_note?: string | null;
    photographer_name?: string | null;
    status?: PhotoItemStatus;
    exclude?: boolean;
    excluded_reason?: string | null;
    duplicate_override?: boolean;
  },
  actor: PhotoQueueActor
) {
  const { data: existing, error } = await supabase
    .from("photo_upload_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load photo item.");
  if (!existing) throw new Error("Photo item not found.");

  const item = existing as PhotoUploadItem;
  if (item.status === "uploaded_to_gingr") {
    throw new Error("Uploaded photos cannot be edited. Reopen the batch first.");
  }

  const updates: Record<string, unknown> = {};
  if (patch.yard !== undefined) updates.yard = patch.yard;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.internal_note !== undefined) updates.internal_note = patch.internal_note;
  if (patch.photographer_name !== undefined) updates.photographer_name = patch.photographer_name;
  if (patch.duplicate_override !== undefined) updates.duplicate_override = Boolean(patch.duplicate_override);

  let excluded = item.status === "excluded";
  if (patch.exclude === true) {
    excluded = true;
    updates.status = "excluded";
    updates.excluded_reason = patch.excluded_reason?.trim() || "Excluded by staff";
  } else if (patch.exclude === false) {
    excluded = false;
    updates.excluded_reason = null;
  } else if (patch.excluded_reason !== undefined) {
    updates.excluded_reason = patch.excluded_reason;
  }

  if (patch.status && !excluded) {
    updates.status = patch.status;
  }

  const nextItem: PhotoUploadItem = {
    ...item,
    duplicate_override:
      patch.duplicate_override !== undefined ? Boolean(patch.duplicate_override) : item.duplicate_override,
    status: excluded
      ? "excluded"
      : ((updates.status as PhotoItemStatus | undefined) ?? item.status),
    excluded_reason:
      (updates.excluded_reason as string | null | undefined) !== undefined
        ? (updates.excluded_reason as string | null)
        : item.excluded_reason
  };

  if (excluded) {
    updates.status = "excluded";
  } else if (
    !["included_in_export", "uploaded_to_gingr", "failed", "processing"].includes(nextItem.status)
  ) {
    updates.status = await recomputeItemStatus(supabase, nextItem);
  }

  const { data, error: updateError } = await supabase
    .from("photo_upload_items")
    .update(updates)
    .eq("id", itemId)
    .select("*")
    .single();
  if (updateError || !data) throw new Error(updateError?.message || "Unable to update photo item.");

  await writeAudit(supabase, {
    batchId: item.batch_id,
    photoItemId: itemId,
    action: patch.exclude ? "item.excluded" : "item.updated",
    oldValue: { status: item.status, yard: item.yard, category: item.category },
    newValue: updates,
    reason: patch.excluded_reason ?? null,
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  await refreshBatchStatus(supabase, item.batch_id);
  return data as PhotoUploadItem;
}

export async function setPhotoDogs(
  supabase: SupabaseClient,
  itemId: string,
  dogs: Array<{
    gingr_pet_id?: string | null;
    dog_name: string;
    owner_name?: string | null;
    dog_photo_url?: string | null;
    reservation_type?: string | null;
    assignment_source?: PhotoAssignmentSource;
  }>,
  actor: PhotoQueueActor
) {
  const { data: existing, error } = await supabase
    .from("photo_upload_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load photo item.");
  if (!existing) throw new Error("Photo item not found.");
  const item = existing as PhotoUploadItem;

  if (item.status === "uploaded_to_gingr" || item.status === "included_in_export") {
    throw new Error("Cannot change dog assignments after export/upload.");
  }

  const cleaned = dogs
    .map((dog) => ({
      photo_item_id: itemId,
      gingr_pet_id: dog.gingr_pet_id?.trim() || null,
      dog_name: String(dog.dog_name || "").trim(),
      owner_name: dog.owner_name?.trim() || null,
      dog_photo_url: dog.dog_photo_url?.trim() || null,
      reservation_type: dog.reservation_type?.trim() || null,
      assignment_source: (dog.assignment_source || "manual") as PhotoAssignmentSource,
      created_by: actorId(actor)
    }))
    .filter((dog) => dog.dog_name);

  const { error: deleteError } = await supabase
    .from("photo_upload_item_dogs")
    .delete()
    .eq("photo_item_id", itemId);
  if (deleteError) throw new Error(deleteError.message || "Unable to clear dog assignments.");

  let inserted: PhotoUploadDogAssignment[] = [];
  if (cleaned.length) {
    const { data, error: insertError } = await supabase
      .from("photo_upload_item_dogs")
      .insert(cleaned)
      .select("*");
    if (insertError) throw new Error(insertError.message || "Unable to save dog assignments.");
    inserted = (data ?? []) as PhotoUploadDogAssignment[];
  }

  const nextStatus = deriveItemStatus({
    dogCount: cleaned.length,
    hasDuplicate: Boolean(item.duplicate_of_item_id),
    duplicateOverride: Boolean(item.duplicate_override),
    excluded: item.status === "excluded",
    failed: item.status === "failed"
  });

  const { data: updated, error: statusError } = await supabase
    .from("photo_upload_items")
    .update({ status: nextStatus })
    .eq("id", itemId)
    .select("*")
    .single();
  if (statusError || !updated) throw new Error(statusError?.message || "Unable to update item status.");

  await writeAudit(supabase, {
    batchId: item.batch_id,
    photoItemId: itemId,
    action: "item.dogs_set",
    newValue: { dogs: cleaned.map((d) => d.dog_name), status: nextStatus },
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  await refreshBatchStatus(supabase, item.batch_id);
  return { item: updated as PhotoUploadItem, dogs: inserted };
}

export async function bulkUpdateItems(
  supabase: SupabaseClient,
  itemIds: string[],
  patch: {
    yard?: string | null;
    category?: string | null;
    photographer_name?: string | null;
    exclude?: boolean;
    excluded_reason?: string | null;
    duplicate_override?: boolean;
    dogs?: Array<{
      gingr_pet_id?: string | null;
      dog_name: string;
      owner_name?: string | null;
      dog_photo_url?: string | null;
      reservation_type?: string | null;
      assignment_source?: PhotoAssignmentSource;
    }>;
  },
  actor: PhotoQueueActor
) {
  const ids = [...new Set(itemIds.map(String).filter(Boolean))];
  if (!ids.length) throw new Error("No photo items selected.");

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      if (patch.dogs) {
        await setPhotoDogs(supabase, id, patch.dogs, actor);
      }
      const fieldPatch = { ...patch };
      delete (fieldPatch as { dogs?: unknown }).dogs;
      if (
        fieldPatch.yard !== undefined ||
        fieldPatch.category !== undefined ||
        fieldPatch.photographer_name !== undefined ||
        fieldPatch.exclude !== undefined ||
        fieldPatch.duplicate_override !== undefined
      ) {
        await updatePhotoItem(supabase, id, fieldPatch, actor);
      }
      results.push({ id, ok: true });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof Error ? error.message : "Update failed."
      });
    }
  }
  return { results };
}

export async function prepareExport(
  supabase: SupabaseClient,
  input: { batchId: string; itemIds?: string[] | null; actor: PhotoQueueActor }
) {
  const { batchId, actor } = input;
  const { data: batch, error: batchError } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");
  if (LOCKED_BATCH_STATUSES.has(batch.status as PhotoBatchStatus)) {
    throw new Error("This batch is locked. Reopen it before exporting again.");
  }

  let query = supabase
    .from("photo_upload_items")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "ready_for_gingr")
    .order("created_at", { ascending: true });

  if (input.itemIds?.length) {
    query = query.in("id", input.itemIds);
  }

  const { data: itemRows, error: itemsError } = await query;
  if (itemsError) throw new Error(itemsError.message || "Unable to load export items.");
  const items = (itemRows ?? []) as PhotoUploadItem[];
  if (!items.length) {
    throw new Error("No ready photos to export. Assign dogs and resolve review items first.");
  }

  const dogMap = await loadDogsForItems(
    supabase,
    items.map((i) => i.id)
  );

  for (const item of items) {
    const dogs = dogMap.get(item.id) ?? [];
    if (!dogs.length) {
      throw new Error(`Photo "${item.original_filename}" has no dog assigned.`);
    }
    if (!item.gingr_ready_storage_path) {
      throw new Error(`Photo "${item.original_filename}" is missing a Gingr-ready file.`);
    }
  }

  const { data: priorExports } = await supabase
    .from("photo_upload_exports")
    .select("export_number")
    .eq("batch_id", batchId)
    .order("export_number", { ascending: false })
    .limit(1);
  const exportNumber = ((priorExports?.[0] as { export_number?: number } | undefined)?.export_number ?? 0) + 1;

  const { data: exportRow, error: exportError } = await supabase
    .from("photo_upload_exports")
    .insert({
      batch_id: batchId,
      export_number: exportNumber,
      total_items: items.length,
      created_by: actorId(actor),
      created_by_name: actorName(actor)
    })
    .select("*")
    .single();
  if (exportError || !exportRow) throw new Error(exportError?.message || "Unable to create export record.");

  const exportItems: Array<{ export_id: string; photo_item_id: string; exported_filename: string }> = [];
  const fileBuffers: Array<{ name: string; buffer: Buffer }> = [];

  let index = 1;
  for (const item of items) {
    const dogs = dogMap.get(item.id) ?? [];
    const fileName = buildExportFileName({
      serviceDate: String(batch.service_date),
      dogNames: dogs.map((d) => d.dog_name),
      category: item.category || batch.default_category || "Photo",
      index
    });
    index += 1;
    exportItems.push({
      export_id: exportRow.id,
      photo_item_id: item.id,
      exported_filename: fileName
    });
    const buffer = await downloadPhotoBuffer(supabase, item.gingr_ready_storage_path!);
    fileBuffers.push({ name: fileName, buffer });
  }

  const { error: linkError } = await supabase.from("photo_upload_export_items").insert(exportItems);
  if (linkError) throw new Error(linkError.message || "Unable to save export items.");

  let zip_storage_path: string | null = null;
  let download_url: string | null = null;
  let zip_url: string | null = null;
  let single_file = false;

  if (fileBuffers.length === 1) {
    single_file = true;
    const only = fileBuffers[0]!;
    // Re-upload under export folder with final Gingr filename for a clean single download.
    const path = buildPhotoStoragePath({
      batchId,
      kind: "exports",
      fileName: only.name.replace(/\.jpg$/i, ""),
      ext: "jpg"
    });
    // Prefer exact exported filename in path leaf when possible
    const exactPath = `exports/${batchId}/${only.name}`;
    try {
      await uploadPhotoBuffer(supabase, exactPath, only.buffer, "image/jpeg");
      zip_storage_path = exactPath;
    } catch {
      await uploadPhotoBuffer(supabase, path, only.buffer, "image/jpeg");
      zip_storage_path = path;
    }
    download_url = await createPhotoSignedUrl(supabase, zip_storage_path);
  } else {
    const zip = new JSZip();
    for (const file of fileBuffers) {
      zip.file(file.name, file.buffer);
    }
    const zipBuffer = Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    zip_storage_path = buildPhotoStoragePath({
      batchId,
      kind: "exports",
      fileName: `gingr-photos-export-${exportNumber}`,
      ext: "zip"
    });
    await uploadPhotoBuffer(supabase, zip_storage_path, zipBuffer, "application/zip");
    zip_url = await createPhotoSignedUrl(supabase, zip_storage_path);
    download_url = zip_url;
  }

  await supabase
    .from("photo_upload_exports")
    .update({ zip_storage_path })
    .eq("id", exportRow.id);

  const itemIds = items.map((i) => i.id);
  await supabase
    .from("photo_upload_items")
    .update({ status: "included_in_export" })
    .in("id", itemIds);

  const now = new Date().toISOString();
  await supabase
    .from("photo_upload_batches")
    .update({ exported_at: now, status: "exported" })
    .eq("id", batchId);

  await writeAudit(supabase, {
    batchId,
    action: "batch.exported",
    newValue: { export_id: exportRow.id, total_items: items.length, single_file },
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  await refreshBatchStatus(supabase, batchId);

  const exportRecord: PhotoUploadExport = {
    ...(exportRow as PhotoUploadExport),
    zip_storage_path,
    zip_url
  };

  return {
    export: exportRecord,
    download_url,
    zip_url,
    single_file
  };
}

export async function markUploadedToGingr(
  supabase: SupabaseClient,
  input: {
    batchId: string;
    exportId?: string | null;
    itemIds?: string[] | null;
    actor: PhotoQueueActor;
    confirm: boolean;
  }
) {
  if (!input.confirm) {
    throw new Error("Confirmation is required to mark photos as uploaded to Gingr.");
  }

  const { data: batch, error: batchError } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", input.batchId)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");

  let exportId = input.exportId ?? null;
  if (!exportId) {
    const { data: latest } = await supabase
      .from("photo_upload_exports")
      .select("id")
      .eq("batch_id", input.batchId)
      .order("export_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    exportId = latest?.id ?? null;
  }

  const now = new Date().toISOString();
  const actor = input.actor;

  if (exportId) {
    await supabase
      .from("photo_upload_exports")
      .update({
        locked_at: now,
        confirmed_uploaded_at: now,
        confirmed_uploaded_by: actorId(actor),
        confirmed_uploaded_by_name: actorName(actor)
      })
      .eq("id", exportId);
  }

  let itemIds = input.itemIds?.filter(Boolean) ?? [];
  if (!itemIds.length && exportId) {
    const { data: links } = await supabase
      .from("photo_upload_export_items")
      .select("photo_item_id")
      .eq("export_id", exportId);
    itemIds = (links ?? []).map((row) => String(row.photo_item_id));
  }
  if (!itemIds.length) {
    const { data: ready } = await supabase
      .from("photo_upload_items")
      .select("id")
      .eq("batch_id", input.batchId)
      .in("status", ["included_in_export", "ready_for_gingr"]);
    itemIds = (ready ?? []).map((row) => String(row.id));
  }
  if (!itemIds.length) throw new Error("No export items found to mark as uploaded.");

  await supabase
    .from("photo_upload_items")
    .update({
      status: "uploaded_to_gingr",
      uploaded_to_gingr_at: now,
      uploaded_to_gingr_by: actorId(actor)
    })
    .in("id", itemIds);

  const { counts } = await refreshBatchStatus(supabase, input.batchId);
  const allUploaded =
    counts.uploaded_to_gingr + counts.excluded + counts.failed >= counts.total && counts.total > 0;

  await supabase
    .from("photo_upload_batches")
    .update({
      uploaded_to_gingr_at: now,
      uploaded_to_gingr_by: actorId(actor),
      uploaded_to_gingr_by_name: actorName(actor),
      status: allUploaded ? "uploaded_to_gingr" : "partially_uploaded"
    })
    .eq("id", input.batchId);

  await writeAudit(supabase, {
    batchId: input.batchId,
    action: "batch.marked_uploaded",
    newValue: { export_id: exportId, item_ids: itemIds, all_uploaded: allUploaded },
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  return getBatchDetail(supabase, input.batchId);
}

export async function reopenBatch(
  supabase: SupabaseClient,
  batchId: string,
  reason: string,
  actor: PhotoQueueActor
) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reopen reason is required.");

  const { data: batch, error } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("photo_upload_batches")
    .update({
      reopen_reason: trimmed,
      reopened_at: now,
      reopened_by: actorId(actor),
      uploaded_to_gingr_at: null,
      uploaded_to_gingr_by: null,
      uploaded_to_gingr_by_name: null,
      archived_at: null,
      status: "needs_review"
    })
    .eq("id", batchId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message || "Unable to reopen batch.");

  // Unlock latest exports and roll uploaded/exported items back to ready_for_gingr when they have dogs.
  await supabase
    .from("photo_upload_exports")
    .update({ locked_at: null })
    .eq("batch_id", batchId);

  const { data: items } = await supabase
    .from("photo_upload_items")
    .select("id, status, duplicate_of_item_id, duplicate_override")
    .eq("batch_id", batchId)
    .in("status", ["uploaded_to_gingr", "included_in_export"]);

  for (const row of items ?? []) {
    const dogs = await loadDogsForItems(supabase, [row.id]);
    const dogCount = (dogs.get(row.id) ?? []).length;
    const next = deriveItemStatus({
      dogCount,
      hasDuplicate: Boolean(row.duplicate_of_item_id),
      duplicateOverride: Boolean(row.duplicate_override),
      excluded: false
    });
    await supabase
      .from("photo_upload_items")
      .update({
        status: next,
        uploaded_to_gingr_at: null,
        uploaded_to_gingr_by: null
      })
      .eq("id", row.id);
  }

  await writeAudit(supabase, {
    batchId,
    action: "batch.reopened",
    reason: trimmed,
    oldValue: { status: batch.status },
    newValue: { status: "needs_review" },
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  await refreshBatchStatus(supabase, batchId);
  return getBatchDetail(supabase, batchId);
}

export async function updateBatchFields(
  supabase: SupabaseClient,
  batchId: string,
  patch: {
    batch_name?: string;
    service_date?: string;
    photographer_name?: string;
    default_yard?: string;
    default_category?: string;
    internal_note?: string | null;
  },
  actor: PhotoQueueActor
) {
  const { data: batch, error } = await supabase
    .from("photo_upload_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load batch.");
  if (!batch) throw new Error("Batch not found.");
  if (LOCKED_BATCH_STATUSES.has(batch.status as PhotoBatchStatus)) {
    throw new Error("This batch is locked. Reopen it before editing.");
  }

  const updates: Record<string, unknown> = {};
  if (patch.batch_name !== undefined) updates.batch_name = String(patch.batch_name).trim();
  if (patch.service_date !== undefined) {
    const date = String(patch.service_date).trim();
    if (!isDateOnly(date)) throw new Error("service_date must be YYYY-MM-DD.");
    updates.service_date = date;
  }
  if (patch.photographer_name !== undefined) {
    const name = String(patch.photographer_name).trim();
    if (!name) throw new Error("Photographer name is required.");
    updates.photographer_name = name;
  }
  if (patch.default_yard !== undefined) updates.default_yard = String(patch.default_yard).trim();
  if (patch.default_category !== undefined) {
    updates.default_category = String(patch.default_category).trim();
  }
  if (patch.internal_note !== undefined) updates.internal_note = patch.internal_note;

  if (!Object.keys(updates).length) return batch as PhotoUploadBatch;

  const { data, error: updateError } = await supabase
    .from("photo_upload_batches")
    .update(updates)
    .eq("id", batchId)
    .select("*")
    .single();
  if (updateError || !data) throw new Error(updateError?.message || "Unable to update batch.");

  await writeAudit(supabase, {
    batchId,
    action: "batch.updated",
    oldValue: {
      batch_name: batch.batch_name,
      service_date: batch.service_date,
      photographer_name: batch.photographer_name
    },
    newValue: updates,
    performedBy: actorId(actor),
    performedByName: actorName(actor)
  });

  return data as PhotoUploadBatch;
}

export async function loadCheckedInDogsForDate(
  supabase: SupabaseClient,
  serviceDate: string
): Promise<{ dogs: PhotoUploadCheckedInDog[]; warning?: string }> {
  const date = String(serviceDate || "").trim();
  if (!isDateOnly(date)) {
    return { dogs: [], warning: "Invalid service date. Expected YYYY-MM-DD." };
  }

  const todayPacific = pacificDateKey(new Date());
  if (date === todayPacific) {
    try {
      const { dogs } = await loadActiveDogsForGroomingPush(supabase);
      return {
        dogs: dogs
          .filter((dog) => dog.status === "checked_in" || dog.group === "checked_in")
          .map(
            (dog): PhotoUploadCheckedInDog => ({
              dogId: dog.dogId,
              dogName: dog.dogName,
              ownerName: dog.ownerName,
              dogPhotoUrl: dog.dogPhotoUrl,
              status: dog.status,
              displayStatus: dog.displayStatus,
              reservationType: dog.reservationType,
              gingrAnimalId: dog.gingrAnimalId,
              checkedInAt: dog.checkedInAt
            })
          )
      };
    } catch (error) {
      return {
        dogs: [],
        warning:
          error instanceof Error
            ? `Unable to load today's checked-in dogs: ${error.message}`
            : "Unable to load today's checked-in dogs."
      };
    }
  }

  try {
    const { startIso, endIso } = pacificDayBounds(date);
    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select(
        "id, gingr_animal_id, gingr_reservation_id, animal_name, owner_name, photo_url, reservation_type, display_status, current_status, status_started_at, created_at, updated_at, hidden"
      )
      .eq("hidden", false)
      .or(
        `and(updated_at.gte.${startIso},updated_at.lt.${endIso}),and(created_at.gte.${startIso},created_at.lt.${endIso}),and(status_started_at.gte.${startIso},status_started_at.lt.${endIso})`
      )
      .order("animal_name", { ascending: true })
      .limit(500);

    if (error) {
      return {
        dogs: [],
        warning: `Checked-in dog list for past dates is limited. ${error.message}`
      };
    }

    const dogs: PhotoUploadCheckedInDog[] = (data ?? []).map((row) => ({
      dogId: String(row.gingr_animal_id || row.gingr_reservation_id || row.id),
      dogName: String(row.animal_name || "Unknown"),
      ownerName: row.owner_name ?? undefined,
      dogPhotoUrl: row.photo_url ?? undefined,
      status: String(row.display_status || row.current_status || "unknown"),
      displayStatus: String(row.display_status || row.current_status || "Unknown"),
      reservationType: row.reservation_type ?? undefined,
      gingrAnimalId: row.gingr_animal_id ?? undefined,
      checkedInAt: row.status_started_at ?? row.updated_at ?? undefined
    }));

    return {
      dogs,
      warning:
        dogs.length === 0
          ? "No dogs found for that date in the live board history. You can still assign dogs manually by name."
          : undefined
    };
  } catch (error) {
    return {
      dogs: [],
      warning:
        error instanceof Error
          ? error.message
          : "Unable to load checked-in dogs for that date. You can still assign dogs manually."
    };
  }
}
