import { marketingJson, requireMarketingAccess } from "@/lib/marketing/api";
import { completeUploadBatch, createUploadBatch, finalizeUploadFile, startUploadBatch } from "@/lib/marketing/uploads";
import { createMarketingSignedUpload } from "@/lib/marketing/storage-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireMarketingAccess(request);
  if (gate.error) return gate.error;
  const batchId = new URL(request.url).searchParams.get("batchId");
  let query = gate.actor!.supabase.from("marketing_upload_batches").select("*").order("created_at", { ascending: false }).limit(25);
  if (batchId) query = gate.actor!.supabase.from("marketing_upload_batches").select("*").eq("id", batchId);
  const { data, error } = await query;
  if (error) return marketingJson({ error: error.message }, 500);
  return marketingJson({ batches: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireMarketingAccess(request, true);
  if (gate.error) return gate.error;
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "create_batch");
  const actor = { id: gate.actor!.session.adminUserId ?? null, email: gate.actor!.session.email };

  try {
    if (action === "create_batch") {
      const batch = await createUploadBatch(gate.actor!.supabase, {
        title: String(body.title ?? "") || null,
        photoDate: String(body.photoDate ?? "") || null,
        campaignId: String(body.campaignId ?? "") || null,
        activity: String(body.activity ?? "") || null,
        photographer: String(body.photographer ?? "") || null,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        dogAssignmentType: String(body.dogAssignmentType ?? "unmatched"),
        actor
      });
      return marketingJson({ batch });
    }

    const batchId = String(body.batchId ?? "");
    if (!batchId) return marketingJson({ error: "batchId is required." }, 400);

    if (action === "start") {
      const batch = await startUploadBatch(gate.actor!.supabase, batchId, Number(body.totalFiles ?? 0), actor);
      return marketingJson({ batch });
    }

    if (action === "signed_url") {
      const signed = await createMarketingSignedUpload(gate.actor!.supabase, {
        batchId,
        fileName: String(body.fileName ?? "upload.jpg"),
        mimeType: String(body.mimeType ?? "image/jpeg"),
        fileSize: Number(body.fileSize ?? 0)
      });
      return marketingJson({ ...signed, batchId });
    }

    if (action === "finalize_file") {
      const item = await finalizeUploadFile(gate.actor!.supabase, {
        batchId,
        storagePath: String(body.storagePath ?? ""),
        fileName: String(body.fileName ?? ""),
        mimeType: String(body.mimeType ?? ""),
        fileSize: Number(body.fileSize ?? 0),
        checksum: String(body.checksum ?? "") || null,
        displayTitle: String(body.displayTitle ?? "") || null,
        photoDate: String(body.photoDate ?? "") || null,
        activity: String(body.activity ?? "") || null,
        photographer: String(body.photographer ?? "") || null,
        actor
      });
      return marketingJson({ item });
    }

    if (action === "complete_batch") {
      const batch = await completeUploadBatch(gate.actor!.supabase, batchId, actor);
      return marketingJson({ batch });
    }

    return marketingJson({ error: "Unknown action." }, 400);
  } catch (error) {
    return marketingJson({ error: error instanceof Error ? error.message : "Upload action failed." }, 500);
  }
}
