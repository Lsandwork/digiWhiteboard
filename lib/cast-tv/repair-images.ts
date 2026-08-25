import type { CastTvMediaRecord } from "@/lib/cast-tv/types";
import { dedupeCastTvMedia, isLocalCastTvAsset, matchCastTvDuplicate } from "@/lib/cast-tv/display-image";
import { isTransientCastTvStorageError } from "@/lib/cast-tv/errors";
import { deleteRemovedCastTvStorage, loadCastTvLibrary, saveCastTvLibrary } from "@/lib/cast-tv/library-store";
import { normalizeStoredCastTvImage } from "@/lib/cast-tv/stored-image";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function repairCastTvLibraryImages(
  supabase: SupabaseClient,
  options: { budgetMs?: number } = {}
): Promise<CastTvMediaRecord[]> {
  const budgetMs = options.budgetMs ?? 35_000;
  const started = Date.now();
  const library = await loadCastTvLibrary(supabase, { skipCache: true, recoverOrphans: false, trigger: "mutation" });
  const nextMedia: CastTvMediaRecord[] = [];
  let changed = false;
  const removed: CastTvMediaRecord[] = [];

  for (const item of library.media) {
    if (item.storage_missing) {
      nextMedia.push(item);
      continue;
    }
    if (item.media_type !== "image") {
      nextMedia.push(item);
      continue;
    }

    if (isLocalCastTvAsset(item)) {
      if (item.display_ready) {
        nextMedia.push(item);
      } else {
        nextMedia.push({ ...item, display_ready: true });
        changed = true;
      }
      continue;
    }

    if (item.display_ready && item.content_hash) {
      const duplicate = matchCastTvDuplicate(nextMedia, {
        fileName: item.file_name,
        contentHash: item.content_hash,
        pixelHash: item.pixel_hash,
        ignoreId: item.id
      });
      if (duplicate) {
        removed.push(item);
        changed = true;
        continue;
      }
      nextMedia.push(item);
      continue;
    }

    if (Date.now() - started > budgetMs) {
      nextMedia.push(item);
      continue;
    }

    try {
      const normalized = await normalizeStoredCastTvImage(supabase, {
        fileName: item.file_name,
        mimeType: item.mime_type || "image/jpeg",
        storagePath: item.storage_path,
        fileSize: item.file_size_bytes || 1,
        bucket: item.bucket
      });
      const duplicate = matchCastTvDuplicate(nextMedia, {
        fileName: normalized.fileName,
        contentHash: normalized.contentHash,
        pixelHash: normalized.pixelHash,
        originalHash: normalized.originalHash,
        ignoreId: item.id
      });
      if (duplicate) {
        removed.push(item);
        changed = true;
        continue;
      }
      const now = new Date().toISOString();
      nextMedia.push({
        ...item,
        file_name: originalNameKeep(item.file_name, normalized.fileName),
        storage_path: normalized.storagePath,
        bucket: normalized.bucket ?? item.bucket,
        mime_type: normalized.mimeType,
        file_size_bytes: normalized.fileSize,
        content_hash: normalized.contentHash ?? null,
        pixel_hash: normalized.pixelHash ?? null,
        display_ready: true,
        public_url: null,
        updated_at: now
      });
      changed = true;
    } catch (error) {
      if (isTransientCastTvStorageError(error)) {
        nextMedia.push(item);
        continue;
      }
      nextMedia.push({ ...item, is_enabled: false });
      changed = true;
    }
  }

  const media = dedupeCastTvMedia(nextMedia);
  if (changed) {
    const ordered = media.map((item, index) => ({ ...item, display_order: index + 1 }));
    await saveCastTvLibrary(supabase, { ...library, media: ordered });
    if (removed.length) {
      await deleteRemovedCastTvStorage(supabase, removed);
    }
    return ordered;
  }

  return media;
}

function originalNameKeep(existing: string, jpegName: string) {
  const fromUuid = /^[0-9a-f]{8}[- ]/i.test(existing.split("/").pop() || existing);
  if (fromUuid) return jpegName;
  if (/\.(png|webp|heic|heif|jpeg|jpg)$/i.test(existing)) {
    return existing.replace(/\.[^.]+$/, ".jpg");
  }
  return jpegName;
}
