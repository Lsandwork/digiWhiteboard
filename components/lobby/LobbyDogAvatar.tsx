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
        "lobby-dog-avatar relative shrink-0 overflow-hidden rounded-full border-2 border-lobby-orange/70 bg-lobby-card shadow-lobbyGlow",
        size === "featured" ? "lobby-dog-avatar--featured" : "lobby-dog-avatar--queue"
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
        <div className="lobby-dog-avatar__fallback grid h-full w-full place-items-center bg-lobby-orange/15 font-black text-orange-50">
          {initial}
        </div>
      )}
    </div>
  );
}
