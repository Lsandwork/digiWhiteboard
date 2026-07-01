import { NextResponse } from "next/server";
import { loadStoredAnimalPhotoUrl } from "@/lib/animal-photo-store";
import { getCachedGingrAnimalPhotoUrl, getGingrAnimalPhotoUrl } from "@/lib/gingr-animal-photo";
import { ANIMAL_PHOTO_COOLDOWN_MS, canFetchAnimalPhoto } from "@/lib/gingr-request-guard";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CACHE_SECONDS = Math.floor(ANIMAL_PHOTO_COOLDOWN_MS / 1000);

export async function GET(request: Request) {
  const animalId = new URL(request.url).searchParams.get("animalId")?.trim() ?? "";

  if (!/^[A-Za-z0-9_-]+$/.test(animalId)) {
    return NextResponse.json({ error: "Valid animalId is required.", photo_url: null }, { status: 400 });
  }

  const cachedPhoto = getCachedGingrAnimalPhotoUrl(animalId);
  if (cachedPhoto !== undefined) {
    return NextResponse.json(
      { photo_url: cachedPhoto },
      {
        headers: {
          "Cache-Control": `private, max-age=${CACHE_SECONDS}`
        }
      }
    );
  }

  let photoUrl: string | null = null;

  try {
    photoUrl = await loadStoredAnimalPhotoUrl(getServiceSupabase(), animalId);
  } catch {
    photoUrl = null;
  }

  if (!photoUrl && canFetchAnimalPhoto(animalId)) {
    photoUrl = await getGingrAnimalPhotoUrl(animalId, 4000);
  }

  return NextResponse.json(
    { photo_url: photoUrl },
    {
      headers: {
        "Cache-Control": `private, max-age=${CACHE_SECONDS}`
      }
    }
  );
}
