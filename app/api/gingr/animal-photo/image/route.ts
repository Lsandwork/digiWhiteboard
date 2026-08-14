import { after, NextResponse } from "next/server";
import { persistAnimalPhotoUrl, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import { getCachedGingrAnimalPhotoUrl, getGingrAnimalPhotoUrl } from "@/lib/gingr-animal-photo";
import { isAllowedGingrPhotoHost } from "@/lib/gingr-photo-display";
import { normalizePhotoUrl } from "@/lib/board-utils";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

function allowedAnimalId(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function resolveRequestedSrc(raw: string | null) {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return null;
  const normalized = normalizePhotoUrl(trimmed);
  try {
    const url = new URL(normalized);
    if (!isAllowedGingrPhotoHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchImageBytes(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "force-cache",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: ""
      }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return { buffer, contentType: contentType || "image/jpeg" };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const animalId = search.get("animalId")?.trim() ?? "";
  const src = resolveRequestedSrc(search.get("src"));

  if (animalId && !allowedAnimalId(animalId)) {
    return new NextResponse(null, { status: 400 });
  }

  let photoUrl = src;

  if (!photoUrl && animalId) {
    photoUrl = getCachedGingrAnimalPhotoUrl(animalId) ?? null;
    if (!photoUrl) {
      try {
        photoUrl = await loadStoredAnimalPhotoUrl(getServiceSupabase(), animalId);
      } catch {
        photoUrl = null;
      }
    }
    if (!photoUrl) {
      photoUrl = await getGingrAnimalPhotoUrl(animalId, 4000);
    }
    if (photoUrl) {
      const persistUrl = photoUrl;
      after(() => {
        void persistAnimalPhotoUrl(getServiceSupabase(), animalId, persistUrl).catch(() => undefined);
      });
    }
  }

  if (!photoUrl) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=30" } });
  }

  const image = await fetchImageBytes(photoUrl);
  if (!image) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=30" } });
  }

  return new NextResponse(image.buffer, {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
