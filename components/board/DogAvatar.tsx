"use client";

import { useState } from "react";
import clsx from "clsx";
import { Dog } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { resolveDogPhotoUrl } from "@/lib/board-utils";

type DogAvatarProps = {
  dog: LiveDog;
  mode: "in" | "out";
  isAlerting?: boolean;
  isNew?: boolean;
};

function LetterFallback({ initial, mode }: { initial: string; mode: "in" | "out" }) {
  return (
    <div
      className={clsx(
        "grid h-full w-full place-items-center",
        mode === "in" ? "bg-fitdog-blue/15 text-blue-100" : "bg-fitdog-orange/15 text-orange-100"
      )}
    >
      {initial ? (
        <span className="text-3xl font-black sm:text-4xl">{initial}</span>
      ) : (
        <Dog className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={1.75} />
      )}
    </div>
  );
}

function DogAvatarContent({
  photoUrl,
  animalName,
  initial,
  mode,
  isNew
}: {
  photoUrl: string;
  animalName: string;
  initial: string;
  mode: "in" | "out";
  isNew: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return <LetterFallback initial={initial} mode={mode} />;
  }

  return (
    <>
      {!loaded ? <LetterFallback initial={initial} mode={mode} /> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={`Photo of ${animalName}`}
        className={clsx(
          "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          isNew && mode === "out" && "checkout-avatar-photo-pop"
        )}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

export function DogAvatar({ dog, mode, isAlerting = false, isNew = false }: DogAvatarProps) {
  const photoUrl = resolveDogPhotoUrl(dog);
  const initial = dog.animal_name.trim().slice(0, 1).toUpperCase();

  return (
    <div
      className={clsx(
        "relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border-2 sm:h-[100px] sm:w-[100px]",
        mode === "in"
          ? "border-fitdog-blue/80 shadow-glowBlue"
          : "border-fitdog-orange/80 shadow-glowOrange",
        isNew && mode === "out" && "checkout-avatar-pop",
        isAlerting && mode === "out" && "checkout-avatar-alert-ring"
      )}
    >
      {photoUrl ? (
        <DogAvatarContent
          key={`${dog.id}:${photoUrl}`}
          photoUrl={photoUrl}
          animalName={dog.animal_name}
          initial={initial}
          mode={mode}
          isNew={isNew}
        />
      ) : (
        <LetterFallback initial={initial} mode={mode} />
      )}
    </div>
  );
}
