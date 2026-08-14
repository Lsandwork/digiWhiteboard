"use client";

import { memo, useState } from "react";
import clsx from "clsx";
import { toDisplayPhotoUrl } from "@/lib/gingr-photo-display";

type LobbyDogAvatarProps = {
  dogName: string;
  animalId?: string | null;
  imageUrl?: string | null;
  size?: "featured" | "queue";
};

function realPhotoUrl(imageUrl?: string | null) {
  const trimmed = imageUrl?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.includes("fitdog-dog-logo")) return null;
  return trimmed;
}

export const LobbyDogAvatar = memo(function LobbyDogAvatar({
  dogName,
  animalId,
  imageUrl,
  size = "queue"
}: LobbyDogAvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const displayUrl = toDisplayPhotoUrl(realPhotoUrl(imageUrl), animalId);
  const showPhoto = Boolean(displayUrl) && !photoFailed;

  return (
    <div
      className={clsx(
        "lobby-dog-avatar relative shrink-0 overflow-hidden rounded-full border-[3px] border-lobby-orange bg-lobby-cream",
        size === "featured" ? "lobby-dog-avatar--featured" : "lobby-dog-avatar--queue"
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl ?? undefined}
          alt={`Photo of ${dogName}`}
          className="h-full w-full object-cover object-center"
          loading={size === "featured" ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/assets/lobby-whiteboard/light-v2/branding/fitdog-dog-logo-exact.png"
          alt=""
          className="lobby-dog-avatar__fallback-logo h-full w-full object-contain p-[12%]"
          draggable={false}
        />
      )}
    </div>
  );
});
