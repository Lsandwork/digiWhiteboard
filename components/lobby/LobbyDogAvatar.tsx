"use client";

import { useState } from "react";
import clsx from "clsx";

type LobbyDogAvatarProps = {
  dogName: string;
  imageUrl?: string | null;
  size?: "featured" | "queue";
};

export function LobbyDogAvatar({ dogName, imageUrl, size = "queue" }: LobbyDogAvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = dogName.trim().slice(0, 1).toUpperCase() || "?";
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-full border-2 border-fitdog-orange/70 bg-ink-900/80 shadow-glowOrange",
        size === "featured" ? "h-36 w-36 sm:h-44 sm:w-44" : "h-16 w-16 sm:h-20 sm:w-20"
      )}
    >
      {!showImage ? (
        <div className="grid h-full w-full place-items-center bg-fitdog-orange/15 text-2xl font-black text-orange-100 sm:text-3xl">
          {initial}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl ?? undefined}
          alt={`Photo of ${dogName}`}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
