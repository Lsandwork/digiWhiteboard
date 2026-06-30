"use client";

import { useState } from "react";
import clsx from "clsx";
import { Dog } from "lucide-react";
import type { LiveDog } from "@/lib/types";
import { resolveDogPhotoUrl } from "@/lib/board-utils";

type DogAvatarProps = {
  dog: LiveDog;
  mode: "in" | "out";
};

export function DogAvatar({ dog, mode }: DogAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const photoUrl = resolveDogPhotoUrl(dog);
  const initial = dog.animal_name.slice(0, 1).toUpperCase();
  const showPhoto = Boolean(photoUrl) && !imageFailed;

  return (
    <div
      className={clsx(
        "relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full border-2 sm:h-[100px] sm:w-[100px]",
        mode === "in"
          ? "border-fitdog-blue/80 shadow-glowBlue"
          : "border-fitdog-orange/80 shadow-glowOrange"
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl ?? undefined}
          alt={`${dog.animal_name} profile`}
          className="h-full w-full object-cover object-center"
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
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
      )}
    </div>
  );
}
