import { writeMarketingActivity } from "@/lib/marketing/audit";
import { createMarketingNotification } from "@/lib/marketing/notifications";
import { MARKETING_MAX_BATCH_FILES } from "@/lib/marketing/storage-provider";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function createUploadBatch(
  supabase: SupabaseClient,
  input: {
    title?: string | null;
    photoDate?: string | null;
    campaignId?: string | null;
    activity?: string | null;
    photographer?: string | null;
    tags?: string[];
    dogAssignmentType?: string;
    actor: { id?: string | null; email?: string | null };
  }
) {
  const { data, error } = await supabase
    .from("marketing_upload_batches")
    .insert({
      title: input.title ?? null,
      photo_date: input.photoDate ?? null,
      campaign_id: input.campaignId ?? null,
      activity: input.activity ?? null,
      photographer: input.photographer ?? null,
      tags: input.tags ?? [],
      dog_assignment_type: input.dogAssignmentType ?? "unmatched",
      status: "draft",
      created_by_id: input.actor.id ?? null,
      created_by_email: input.actor.email ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function finalizeUploadFile(
  supabase: SupabaseClient,
  input: {
    batchId: string;
    storagePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    checksum?: string | null;
    displayTitle?: string | null;
    photoDate?: string | null;
    activity?: string | null;
    photographer?: string | null;
    actor: { id?: string | null; email?: string | null };
  }
) {
  if (input.checksum) {
    const { data: dupe } = await supabase
      .from("marketing_media_items")
      .select("id")
      .eq("checksum", input.checksum)
      .maybeSingle();
    if (dupe) throw new Error("Duplicate file detected.");
  }

  const { data: item, error } = await supabase
    .from("marketing_media_items")
    .insert({
      batch_id: input.batchId,
      storage_path: input.storagePath,
      file_name: input.fileName,
      display_title: input.displayTitle ?? input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSize,
      checksum: input.checksum ?? null,
      photo_date: input.photoDate ?? null,
      activity: input.activity ?? null,
      photographer: input.photographer ?? null,
      uploaded_by_id: input.actor.id ?? null,
      uploaded_by_email: input.actor.email ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: batch } = await supabase.from("marketing_upload_batches").select("*").eq("id", input.batchId).single();
  if (batch) {
    const completed = (batch.completed_files ?? 0) + 1;
    const total = batch.total_files ?? 0;
    const status = completed >= total && total > 0 ? "completed" : "uploading";
    await supabase
      .from("marketing_upload_batches")
      .update({
        completed_files: completed,
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.batchId);
  }

  return item;
}

export async function markUploadFileFailed(
  supabase: SupabaseClient,
  batchId: string,
  fileName: string,
  actor: { id?: string | null; email?: string | null }
) {
  const { data: batch } = await supabase.from("marketing_upload_batches").select("*").eq("id", batchId).single();
  if (!batch) return;
  await supabase
    .from("marketing_upload_batches")
    .update({
      failed_files: (batch.failed_files ?? 0) + 1,
      status: "failed",
      updated_at: new Date().toISOString()
    })
    .eq("id", batchId);

  await createMarketingNotification(supabase, {
    recipientUserId: actor.id,
    type: "upload_failed",
    title: "Upload failed",
    body: `${fileName} could not be uploaded.`,
    entityType: "marketing_upload_batch",
    entityId: batchId,
    linkPath: `/marketing/upload?batch=${batchId}`
  });
}

export async function startUploadBatch(
  supabase: SupabaseClient,
  batchId: string,
  totalFiles: number,
  actor: { id?: string | null; email?: string | null }
) {
  if (totalFiles > MARKETING_MAX_BATCH_FILES) throw new Error(`Maximum ${MARKETING_MAX_BATCH_FILES} files per batch.`);
  const { data, error } = await supabase
    .from("marketing_upload_batches")
    .update({
      status: "uploading",
      total_files: totalFiles,
      updated_at: new Date().toISOString()
    })
    .eq("id", batchId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeMarketingActivity(supabase, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "marketing.upload.batch_started",
    entityType: "marketing_upload_batch",
    entityId: batchId,
    metadata: { total_files: totalFiles }
  });

  return data;
}

export async function completeUploadBatch(supabase: SupabaseClient, batchId: string, actor: { id?: string | null; email?: string | null }) {
  const { data, error } = await supabase
    .from("marketing_upload_batches")
    .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", batchId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await createMarketingNotification(supabase, {
    recipientUserId: actor.id,
    type: "upload_completed",
    title: "Bulk upload completed",
    body: data.title ? `${data.title} is ready for review.` : "Your upload batch is complete.",
    entityType: "marketing_upload_batch",
    entityId: batchId,
    linkPath: `/marketing/storage?batch=${batchId}`
  });

  return data;
}
