import { getGingrAnimalPhotoUrlMap } from "@/lib/gingr-animal-photo";
import { isLegacyGingrPhotoUrl } from "@/lib/gingr-photo-display";
import { resolveTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import type { TlGingrMedicationRecord } from "./types";

/** Public proxy path for Gingr dog profile photos (works when sync has no URL yet). */
export function tlBoardAnimalPhotoProxyUrl(animalId: string): string {
  return `/api/gingr/animal-photo/image?animalId=${encodeURIComponent(animalId)}`;
}

/**
 * Ordered <img> sources for one dog. The same-origin proxy always trails the
 * direct URL so a stale Gingr link still resolves to a real photo, and legacy
 * Rackspace links are skipped entirely because that CDN returns 404.
 */
export function tlDogPhotoCandidates(
  animalId: string,
  photoUrl: string | null | undefined
): string[] {
  const candidates: string[] = [];
  const direct = photoUrl?.trim();
  if (direct && /^https?:\/\//i.test(direct) && !isLegacyGingrPhotoUrl(direct)) {
    candidates.push(direct);
  }
  const proxy = tlBoardAnimalPhotoProxyUrl(animalId);
  if (animalId?.trim() && !candidates.includes(proxy)) candidates.push(proxy);
  return candidates;
}

/** A stored URL is only usable if it exists and is not on Gingr's dead CDN. */
export function tlPhotoNeedsRefresh(photoUrl: string | null | undefined) {
  const trimmed = photoUrl?.trim();
  if (!trimmed) return true;
  return isLegacyGingrPhotoUrl(trimmed);
}

/**
 * Fill missing medication row photos from Gingr using TL_GINGR_KEY.
 * Best-effort — boards still proxy photos client-side when this returns null.
 */
/** Best-effort Gingr profile photos for arbitrary animal ids (TL_GINGR_KEY). */
export async function enrichTlBoardAnimalPhotoUrls(
  rows: Array<{ gingrAnimalId: string; photoUrl: string | null }>
): Promise<Map<string, string | null>> {
  const apiKey = resolveTlGingrApiKey();
  const missingIds = [
    ...new Set(rows.filter((row) => tlPhotoNeedsRefresh(row.photoUrl)).map((row) => String(row.gingrAnimalId)))
  ];
  if (!apiKey || !missingIds.length) return new Map();

  const { subdomain } = tlGingrClientConfig();
  const photoMap = await getGingrAnimalPhotoUrlMap(missingIds, {
    timeoutMs: 4000,
    bypassFetchGate: true,
    apiKey,
    subdomain
  });
  return photoMap;
}

export async function enrichTlBoardMedicationPhotos(
  medications: TlGingrMedicationRecord[]
): Promise<TlGingrMedicationRecord[]> {
  const apiKey = resolveTlGingrApiKey();
  if (!apiKey || !medications.length) return medications;

  const missingIds = [
    ...new Set(
      medications
        .filter((row) => tlPhotoNeedsRefresh(row.photoUrl))
        .map((row) => String(row.gingrAnimalId))
    )
  ];
  if (!missingIds.length) return medications;

  const { subdomain } = tlGingrClientConfig();
  const photoMap = await getGingrAnimalPhotoUrlMap(missingIds, {
    timeoutMs: 4000,
    bypassFetchGate: true,
    apiKey,
    subdomain
  });

  return medications.map((row) => {
    const fetched = photoMap.get(String(row.gingrAnimalId));
    if (!tlPhotoNeedsRefresh(row.photoUrl)) return row;
    if (fetched) return { ...row, photoUrl: fetched };
    // Drop a dead CDN link so the TV goes straight to the self-healing proxy.
    return isLegacyGingrPhotoUrl(row.photoUrl) ? { ...row, photoUrl: null } : row;
  });
}
