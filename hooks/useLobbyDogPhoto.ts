"use client";

import { useEffect, useState } from "react";

export function useLobbyDogPhoto(animalId: string | null | undefined, initialUrl: string | null | undefined) {
  const [photoUrl, setPhotoUrl] = useState(initialUrl ?? null);

  useEffect(() => {
    setPhotoUrl(initialUrl ?? null);
  }, [initialUrl, animalId]);

  useEffect(() => {
    const trimmedAnimalId = animalId?.trim();
    if (photoUrl || !trimmedAnimalId) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/gingr/animal-photo?animalId=${encodeURIComponent(trimmedAnimalId)}`, {
          cache: "no-store"
        });
        if (!response.ok || cancelled) return;

        const body = (await response.json()) as { photo_url?: string | null };
        const nextUrl = body.photo_url?.trim();
        if (nextUrl && !cancelled) {
          setPhotoUrl(nextUrl);
        }
      } catch {
        // Keep the letter fallback when the photo cannot be loaded.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animalId, photoUrl]);

  return photoUrl;
}
