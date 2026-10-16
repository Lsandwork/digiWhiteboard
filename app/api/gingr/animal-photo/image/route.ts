import { after, NextResponse } from "next/server";
import { persistAnimalPhotoUrl, loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import {
  getCachedGingrAnimalPhotoUrl,
  getGingrAnimalPhotoUrlCandidates,
  invalidateGingrAnimalPhoto
} from "@/lib/gingr-animal-photo";
import { isAllowedGingrPhotoUrl, isLegacyGingrPhotoUrl } from "@/lib/gingr-photo-display";
import { PROXY_IMAGE_HEADERS, createFreshLookupGate, fetchProxiedImage } from "@/lib/gingr-photo-proxy";
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

const allowFreshGingrLookup = createFreshLookupGate({ cooldownMs: 5 * 60_000, perMinute: 30 });

function resolveRequestedSrc(raw: string | null) {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return null;
  const normalized = normalizePhotoUrl(trimmed);
  try {
    const url = new URL(normalized);
    if (!isAllowedGingrPhotoUrl(url)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function fetchImageBytes(url: string) {
  return fetchProxiedImage(url, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: FETCH_TIMEOUT_MS });
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

/** Every photo URL Gingr currently reports, ignoring cached/stale values. */
async function lookupFreshGingrUrls(animalId: string) {
  invalidateGingrAnimalPhoto(animalId);
  const direct = await getGingrAnimalPhotoUrlCandidates(animalId, GINGR_LOOKUP_TIMEOUT_MS);
  if (direct.length) return direct;

  const tlKey = resolveTlGingrApiKey();
  if (!tlKey) return [];
  return getGingrAnimalPhotoUrlCandidates(animalId, GINGR_LOOKUP_TIMEOUT_MS, {
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
        headers: { "Content-Type": image.contentType, ...PROXY_IMAGE_HEADERS }
      });
    }
  }

  // Everything known is stale or missing — re-resolve from Gingr and persist
  // whichever URL actually downloads.
  if (animalId && allowFreshGingrLookup(animalId)) {
    for (const fresh of await lookupFreshGingrUrls(animalId)) {
      if (candidates.includes(fresh)) continue;
      const image = await fetchImageBytes(fresh);
      if (!image) continue;
      after(() => {
        void persistAnimalPhotoUrl(
          getServiceSupabase({ timeoutMs: STORE_TIMEOUT_MS }),
          animalId,
          fresh
        ).catch(() => undefined);
      });
      return new NextResponse(image.buffer, {
        status: 200,
        headers: { "Content-Type": image.contentType, ...PROXY_IMAGE_HEADERS }
      });
    }
  }

  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=30" } });
}
