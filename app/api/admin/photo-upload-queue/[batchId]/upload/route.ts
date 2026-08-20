import { NextResponse } from "next/server";
import { bumpDisplayContentRevision } from "@/lib/display-sync-server";
import { invalidateStaffIdleSlideshowCache } from "@/lib/staff/idle-slideshow";
import { processUploadedPhoto, storeProcessedPhoto } from "@/lib/photo-upload-queue/process";
import { addPhotoItem, findDuplicateByHash } from "@/lib/photo-upload-queue/service";
import {
  demoWriteGuard,
  isPhotoUploadAuthOk,
  requirePhotoUploadAccess
} from "@/lib/photo-upload-queue/api-guard";
import { PHOTO_UPLOAD_MAX_BYTES } from "@/lib/photo-upload-queue/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ batchId: string }> };

const MAX_FILES = 100;
const SERVER_CONCURRENCY = 4;

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = demoWriteGuard(request);
  if (blocked) return blocked;

  const auth = await requirePhotoUploadAccess(request);
  if (!isPhotoUploadAuthOk(auth)) return auth.error;

  try {
    const { batchId } = await context.params;
    const form = await request.formData();
    const files = form
      .getAll("files")
      .concat(form.getAll("file"))
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!files.length) {
      return NextResponse.json({ error: "Select at least one photo." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Limit is ${MAX_FILES} photos per upload request.` },
        { status: 400 }
      );
    }

    const yard = form.get("yard") != null ? String(form.get("yard")) : null;
    const category = form.get("category") != null ? String(form.get("category")) : null;
    const photographer =
      form.get("photographer_name") != null ? String(form.get("photographer_name")) : null;
    // Library uploads skip gingr-ready for speed; export path can generate later if null.
    const fastLibrary = form.get("fast_library") == null || String(form.get("fast_library")) !== "0";

    // Claim hashes inside this request so identical files in the same batch are only stored once.
    const claimedHashes = new Set<string>();
    const claimHash = (hash: string) => {
      const key = hash.trim().toLowerCase();
      if (!key) return true;
      if (claimedHashes.has(key)) return false;
      claimedHashes.add(key);
      return true;
    };

    const results = await mapPool(files, SERVER_CONCURRENCY, async (file) => {
      try {
        if (file.size > PHOTO_UPLOAD_MAX_BYTES) {
          throw new Error("Each photo must be 25MB or smaller.");
        }
        const processed = await processUploadedPhoto(file);
        const hash = String(processed.sha256 || "").trim().toLowerCase();

        if (!claimHash(hash)) {
          return {
            fileName: file.name,
            ok: true as const,
            skipped: true as const,
            duplicate: null,
            error: "Skipped duplicate image in this upload."
          };
        }

        const existing = hash ? await findDuplicateByHash(auth.supabase, hash) : null;
        if (existing) {
          return {
            fileName: file.name,
            ok: true as const,
            skipped: true as const,
            duplicate: existing,
            error: `Skipped duplicate of ${existing.original_filename}`
          };
        }

        const stored = await storeProcessedPhoto({
          supabase: auth.supabase,
          batchId,
          fileName: file.name,
          processed,
          skipGingrReady: fastLibrary
        });
        const added = await addPhotoItem(
          auth.supabase,
          {
            batchId,
            original_filename: file.name,
            ...stored,
            yard,
            category,
            photographer_name: photographer,
            skipDuplicates: true
          },
          auth.actor
        );

        if (added.skipped) {
          // Race: another request inserted the same hash after our check — drop orphaned files.
          const orphanPaths = [
            stored.original_storage_path,
            stored.thumbnail_storage_path,
            stored.gingr_ready_storage_path
          ].filter((path): path is string => Boolean(path));
          if (orphanPaths.length) {
            const { removePhotoPaths } = await import("@/lib/photo-upload-queue/storage");
            await removePhotoPaths(auth.supabase, orphanPaths).catch(() => undefined);
          }
          return {
            fileName: file.name,
            ok: true as const,
            skipped: true as const,
            duplicate: added.duplicate,
            error: added.message
          };
        }

        return {
          fileName: file.name,
          ok: true as const,
          skipped: false as const,
          item: added.item,
          duplicate: null
        };
      } catch (error) {
        return {
          fileName: file.name,
          ok: false as const,
          skipped: false as const,
          error: error instanceof Error ? error.message : "Upload failed."
        };
      }
    });

    const uploaded = results.filter((r) => r.ok && !("skipped" in r && r.skipped)).length;
    const skipped = results.filter((r) => r.ok && "skipped" in r && r.skipped).length;
    const failed = results.filter((r) => !r.ok).length;
    if (uploaded > 0) {
      invalidateStaffIdleSlideshowCache();
      await bumpDisplayContentRevision(auth.supabase).catch(() => undefined);
    }
    return NextResponse.json({
      ok: uploaded > 0 || skipped > 0,
      results,
      uploaded,
      skipped,
      failed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
