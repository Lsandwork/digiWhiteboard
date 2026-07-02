"use client";

import { useState } from "react";
import clsx from "clsx";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets } from "@/lib/lobby/assets";

type LobbyDogAvatarProps = {
  dogName: string;
  imageUrl?: string | null;
  size?: "featured" | "queue";
};

export function LobbyDogAvatar({ dogName, imageUrl, size = "queue" }: LobbyDogAvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [brandFallbackFailed, setBrandFallbackFailed] = useState(false);
  const initial = dogName.trim().slice(0, 1).toUpperCase() || "?";
  const showPhoto = Boolean(imageUrl) && !photoFailed;
  const showBrandFallback = !showPhoto && !brandFallbackFailed;

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
          src={imageUrl ?? undefined}
          alt={`Photo of ${dogName}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
        />
      ) : showBrandFallback ? (
        <LobbyAssetImage
          src={lobbyAssets.dogProfileFallback}
          alt={`${dogName} avatar`}
          width={size === "featured" ? 176 : 80}
          height={size === "featured" ? 176 : 80}
          className="h-full w-full object-cover"
          onFailed={() => setBrandFallbackFailed(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-lobby-orange/15 text-2xl font-black text-orange-50 sm:text-3xl">
          {initial}
        </div>
      )}
    </div>
  );
}
