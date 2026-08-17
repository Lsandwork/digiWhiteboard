import { getGingrAnimalPhotoUrlMap } from "@/lib/gingr-animal-photo";
import { resolveTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import type { TlGingrMedicationRecord } from "./types";

/** Public proxy path for Gingr dog profile photos (works when sync has no URL yet). */
export function tlBoardAnimalPhotoProxyUrl(animalId: string): string {
  return `/api/gingr/animal-photo/image?animalId=${encodeURIComponent(animalId)}`;
}

/**
 * Fill missing medication row photos from Gingr using TL_GINGR_KEY.
 * Best-effort — boards still proxy photos client-side when this returns null.
 */
export async function enrichTlBoardMedicationPhotos(
  medications: TlGingrMedicationRecord[]
): Promise<TlGingrMedicationRecord[]> {
  const apiKey = resolveTlGingrApiKey();
  if (!apiKey || !medications.length) return medications;

  const missingIds = [
    ...new Set(
      medications.filter((row) => !row.photoUrl?.trim()).map((row) => String(row.gingrAnimalId))
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
    if (row.photoUrl?.trim()) return row;
    const fetched = photoMap.get(String(row.gingrAnimalId));
    return fetched ? { ...row, photoUrl: fetched } : row;
  });
}
