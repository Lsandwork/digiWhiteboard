"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useLobbyDogPhoto } from "@/hooks/useLobbyDogPhoto";

type LobbyDogAvatarProps = {
  dogName: string;
  animalId?: string | null;
  imageUrl?: string | null;
  size?: "featured" | "queue";
};

export function LobbyDogAvatar({ dogName, animalId, imageUrl, size = "queue" }: LobbyDogAvatarProps) {
  const resolvedPhotoUrl = useLobbyDogPhoto(animalId, imageUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const initial = dogName.trim().slice(0, 1).toUpperCase() || "?";
  const showPhoto = Boolean(resolvedPhotoUrl) && !photoFailed;

  useEffect(() => {
    setPhotoFailed(false);
  }, [resolvedPhotoUrl]);

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-full border-2 border-lobby-orange/70 bg-lobby-card shadow-lobbyGlow",
        size === "featured" ? "h-36 w-36 sm:h-44 sm:w-44" : "h-16 w-16 sm:h-20 sm:w-20"
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={resolvedPhotoUrl ?? undefined}
          src={resolvedPhotoUrl ?? undefined}
          alt={`Photo of ${dogName}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-lobby-orange/15 text-2xl font-black text-orange-50 sm:text-3xl">
          {initial}
        </div>
      )}
    </div>
  );
}
