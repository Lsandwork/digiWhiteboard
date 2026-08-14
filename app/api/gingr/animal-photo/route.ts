import { after, NextResponse } from "next/server";
import { loadStoredAnimalPhotoUrl, persistAnimalPhotoUrl } from "@/lib/animal-photo-store";
import { getCachedGingrAnimalPhotoUrl, getGingrAnimalPhotoUrl } from "@/lib/gingr-animal-photo";
import { ANIMAL_PHOTO_COOLDOWN_MS, canFetchAnimalPhoto } from "@/lib/gingr-request-guard";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HIT_CACHE_SECONDS = Math.floor(ANIMAL_PHOTO_COOLDOWN_MS / 1000);

function cacheHeaders(photoUrl: string | null) {
  return {
    "Cache-Control": photoUrl
      ? `private, max-age=${HIT_CACHE_SECONDS}`
      : "private, max-age=30, must-revalidate"
  };
}

export async function GET(request: Request) {
  const animalId = new URL(request.url).searchParams.get("animalId")?.trim() ?? "";

  if (!/^[A-Za-z0-9_-]+$/.test(animalId)) {
    return NextResponse.json({ error: "Valid animalId is required.", photo_url: null }, { status: 400 });
  }

  const cachedPhoto = getCachedGingrAnimalPhotoUrl(animalId);
  if (cachedPhoto) {
    return NextResponse.json({ photo_url: cachedPhoto }, { headers: cacheHeaders(cachedPhoto) });
  }

  let photoUrl: string | null = cachedPhoto === null ? null : null;

  if (cachedPhoto === undefined) {
    try {
      photoUrl = await loadStoredAnimalPhotoUrl(getServiceSupabase(), animalId);
    } catch {
      photoUrl = null;
    }

    if (!photoUrl && canFetchAnimalPhoto(animalId, Date.now())) {
      photoUrl = await getGingrAnimalPhotoUrl(animalId, 4000);
    }
  }

  if (photoUrl) {
    after(() => {
      void persistAnimalPhotoUrl(getServiceSupabase(), animalId, photoUrl).catch(() => undefined);
    });
  }

  return NextResponse.json({ photo_url: photoUrl }, { headers: cacheHeaders(photoUrl) });
}
