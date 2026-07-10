"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Dog } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import {
  buildCastOptimizedDogPhotoUrl,
  getStableDogPhotoKey,
  hasLoadedDogPhoto,
  markDogPhotoLoaded,
  rememberStableDogPhoto,
  resolveStableDogPhotoUrl
} from "@/lib/dog-photo-display-cache";
import { useDogPhotoFallback } from "@/hooks/useDogPhotoFallback";

type DogAvatarProps = {
  dog: LiveDog;
  mode: "in" | "out";
  size?: "default" | "solo";
  isAlerting?: boolean;
  isNew?: boolean;
};

function LetterFallback({
  initial,
  mode,
  size = "default"
}: {
  initial: string;
  mode: "in" | "out";
  size?: "default" | "solo";
}) {
  return (
    <div
      className={clsx(
        "grid h-full w-full place-items-center",
        mode === "in" ? "bg-fitdog-blue/15 text-blue-100" : "bg-fitdog-orange/15 text-orange-100"
      )}
    >
      {initial ? (
        <span className={clsx("font-black", size === "solo" ? "text-5xl sm:text-6xl lg:text-7xl" : "text-3xl sm:text-4xl")}>
          {initial}
        </span>
      ) : (
        <Dog
          className={clsx(size === "solo" ? "h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24" : "h-10 w-10 sm:h-12 sm:w-12")}
          strokeWidth={1.75}
        />
      )}
    </div>
  );
}

function DogAvatarContent({
  stableKey,
  photoUrl,
  animalName,
  initial,
  mode,
  isNew,
  size = "default"
}: {
  stableKey: string;
  photoUrl: string;
  animalName: string;
  initial: string;
  mode: "in" | "out";
  isNew: boolean;
  size?: "default" | "solo";
}) {
  const [lastGoodUrl, setLastGoodUrl] = useState(photoUrl);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(() => hasLoadedDogPhoto(stableKey));

  useEffect(() => {
    if (photoUrl) {
      rememberStableDogPhoto(stableKey, photoUrl);
      const timer = window.setTimeout(() => {
        setLastGoodUrl(photoUrl);
        setFailed(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [photoUrl, stableKey]);

  const displayUrl = photoUrl || lastGoodUrl;

  if (!displayUrl || failed) {
    return <LetterFallback initial={initial} mode={mode} size={size} />;
  }

  const showLetterUnderlay = !loaded && !hasLoadedDogPhoto(stableKey);

  return (
    <>
      {showLetterUnderlay ? <LetterFallback initial={initial} mode={mode} size={size} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={displayUrl}
        alt={`Photo of ${animalName}`}
        className={clsx(
          "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300",
          loaded || hasLoadedDogPhoto(stableKey) ? "opacity-100" : "opacity-0",
          isNew && mode === "out" && "checkout-avatar-photo-pop"
        )}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => {
          markDogPhotoLoaded(stableKey);
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
      />
    </>
  );
}

export function DogAvatar({ dog, mode, size = "default", isAlerting = false, isNew = false }: DogAvatarProps) {
  const stableKey = getStableDogPhotoKey(dog);
  const serverPhotoUrl = resolveStableDogPhotoUrl(dog, resolveDogPhotoUrl);
  const photoUrl = useDogPhotoFallback(dog.gingr_animal_id, serverPhotoUrl);
  const [castOptimized, setCastOptimized] = useState(false);
  const initial = dog.animal_name.trim().slice(0, 1).toUpperCase();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCastOptimized(document.documentElement.classList.contains("fitdog-cast-mode"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const displayPhotoUrl = photoUrl && castOptimized
    ? buildCastOptimizedDogPhotoUrl(photoUrl, size === "solo" ? 640 : 256)
    : photoUrl;

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden rounded-full border-2",
        size === "solo"
          ? "h-[132px] w-[132px] border-[3px] sm:h-[168px] sm:w-[168px] lg:h-[208px] lg:w-[208px] xl:h-[240px] xl:w-[240px]"
          : "h-[88px] w-[88px] sm:h-[100px] sm:w-[100px]",
        mode === "in"
          ? "border-fitdog-blue/80 shadow-glowBlue"
          : "border-fitdog-orange/80 shadow-glowOrange",
        isNew && mode === "out" && "checkout-avatar-pop",
        isAlerting && mode === "out" && "checkout-avatar-alert-ring"
      )}
    >
      {displayPhotoUrl ? (
        <DogAvatarContent
          key={stableKey}
          stableKey={stableKey}
          photoUrl={displayPhotoUrl}
          animalName={dog.animal_name}
          initial={initial}
          mode={mode}
          isNew={isNew}
          size={size}
        />
      ) : (
        <LetterFallback initial={initial} mode={mode} size={size} />
      )}
    </div>
  );
}
