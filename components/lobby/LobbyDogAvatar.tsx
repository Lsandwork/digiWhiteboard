"use client";

import { memo, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  buildCastOptimizedDogPhotoUrl,
  rememberStableDogPhoto,
  getRememberedDogPhoto
} from "@/lib/dog-photo-display-cache";
import { getLobbyCheckoutMergeKey } from "@/lib/lobby-display-stable";
import { useDogPhotoFallback } from "@/hooks/useDogPhotoFallback";

type LobbyDogAvatarProps = {
  dogName: string;
  animalId?: string | null;
  imageUrl?: string | null;
  size?: "featured" | "queue";
};

export const LobbyDogAvatar = memo(function LobbyDogAvatar({
  dogName,
  animalId,
  imageUrl,
  size = "queue"
}: LobbyDogAvatarProps) {
  const photoKey = animalId?.trim()
    ? getLobbyCheckoutMergeKey({ id: animalId, gingr_animal_id: animalId })
    : getLobbyCheckoutMergeKey({ id: dogName, gingr_animal_id: null });

  const resolvedPhotoUrl = useDogPhotoFallback(animalId, imageUrl);
  const lastGoodUrlRef = useRef(resolvedPhotoUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [castOptimized, setCastOptimized] = useState(false);
  const initial = dogName.trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    if (resolvedPhotoUrl) {
      rememberStableDogPhoto(photoKey, resolvedPhotoUrl);
      lastGoodUrlRef.current = resolvedPhotoUrl;
      setPhotoFailed(false);
    }
  }, [photoKey, resolvedPhotoUrl]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCastOptimized(document.documentElement.classList.contains("fitdog-cast-mode"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const rawDisplayUrl = resolvedPhotoUrl || lastGoodUrlRef.current || getRememberedDogPhoto(photoKey);
  const displayUrl = rawDisplayUrl && castOptimized
    ? buildCastOptimizedDogPhotoUrl(rawDisplayUrl, size === "featured" ? 640 : 256)
    : rawDisplayUrl;
  const showPhoto = Boolean(displayUrl) && !photoFailed;

  return (
    <div
      className={clsx(
        "lobby-dog-avatar relative shrink-0 overflow-hidden rounded-full border-2 border-lobby-orange/70 bg-lobby-card shadow-lobbyGlow",
        size === "featured" ? "lobby-dog-avatar--featured" : "lobby-dog-avatar--queue"
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photoKey}
          src={displayUrl ?? undefined}
          alt={`Photo of ${dogName}`}
          className="h-full w-full object-cover"
          loading={size === "featured" ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <div className="lobby-dog-avatar__fallback grid h-full w-full place-items-center bg-lobby-orange/15 font-black text-orange-50">
          {initial}
        </div>
      )}
    </div>
  );
});
