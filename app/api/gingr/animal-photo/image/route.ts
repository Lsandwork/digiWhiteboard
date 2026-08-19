import { after, NextResponse } from "next/server";
import { persistAnimalPhotoUrl, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import {
  getCachedGingrAnimalPhotoUrl,
  getGingrAnimalPhotoUrl,
  invalidateGingrAnimalPhoto
} from "@/lib/gingr-animal-photo";
import { isAllowedGingrPhotoHost, isLegacyGingrPhotoUrl } from "@/lib/gingr-photo-display";
import { resolveTlGingrApiKey } from "@/lib/tl-digi-board/gingr-auth";
import { normalizePhotoUrl } from "@/lib/board-utils";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 6_000;
/** Supabase reads here must abort — an unbounded read made this route 504 for every dog. */
const STORE_TIMEOUT_MS = 2_000;
const GINGR_LOOKUP_TIMEOUT_MS = 5_000;

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

async function loadStoredUrl(animalId: string) {
  try {
    return await loadStoredAnimalPhotoUrl(
      getServiceSupabase({ timeoutMs: STORE_TIMEOUT_MS }),
      animalId
    );
  } catch {
    return null;
  }
}

/** Ask Gingr for the animal's current photo, ignoring any cached/stale value. */
async function lookupFreshGingrUrl(animalId: string) {
  invalidateGingrAnimalPhoto(animalId);
  const tlKey = resolveTlGingrApiKey();
  const direct = await getGingrAnimalPhotoUrl(animalId, GINGR_LOOKUP_TIMEOUT_MS);
  if (direct) return direct;
  if (!tlKey) return null;
  invalidateGingrAnimalPhoto(animalId);
  return getGingrAnimalPhotoUrl(animalId, GINGR_LOOKUP_TIMEOUT_MS, {
    bypassFetchGate: true,
    apiKey: tlKey
  });
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const animalId = search.get("animalId")?.trim() ?? "";
  const src = resolveRequestedSrc(search.get("src"));

  if (animalId && !allowedAnimalId(animalId)) {
    return new NextResponse(null, { status: 400 });
  }

  // Ordered candidates. Legacy Rackspace URLs are skipped: that CDN 404s, so
  // trying it first is what left dogs like Sadie showing a placeholder.
  const candidates: string[] = [];
  const pushCandidate = (url: string | null | undefined) => {
    const trimmed = url?.trim();
    if (!trimmed || isLegacyGingrPhotoUrl(trimmed)) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  pushCandidate(src);

  if (animalId) {
    pushCandidate(getCachedGingrAnimalPhotoUrl(animalId) ?? null);
    if (!candidates.length) pushCandidate(await loadStoredUrl(animalId));
  }

  for (const candidate of candidates) {
    const image = await fetchImageBytes(candidate);
    if (image) {
      return new NextResponse(image.buffer, {
        status: 200,
        headers: {
          "Content-Type": image.contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
  }

  // Everything known is stale or missing — re-resolve from Gingr and persist it.
  if (animalId) {
    const fresh = await lookupFreshGingrUrl(animalId);
    if (fresh && !candidates.includes(fresh)) {
      const image = await fetchImageBytes(fresh);
      if (image) {
        after(() => {
          void persistAnimalPhotoUrl(
            getServiceSupabase({ timeoutMs: STORE_TIMEOUT_MS }),
            animalId,
            fresh
          ).catch(() => undefined);
        });
        return new NextResponse(image.buffer, {
          status: 200,
          headers: {
            "Content-Type": image.contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
    }
  }

  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=30" } });
}
