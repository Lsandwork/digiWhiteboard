"use client";

import { memo, useState } from "react";
import { Dog } from "lucide-react";
import { toDisplayPhotoUrl } from "@/lib/gingr-photo-display";
import type { CastLiteDog } from "@/lib/whiteboard/state";

type CastLiteDogCardProps = {
  dog: CastLiteDog;
  mode: "in" | "out";
  lowMotion?: boolean;
};

export const CastLiteDogCard = memo(function CastLiteDogCard({ dog, mode, lowMotion = true }: CastLiteDogCardProps) {
  const [failed, setFailed] = useState(false);
  const photoUrl = toDisplayPhotoUrl(dog.photo_url, dog.gingr_animal_id);
  const initial = dog.animal_name?.trim().charAt(0).toUpperCase() ?? "";
  const personLabel = mode === "in" ? "Owner" : "Pickup";

  return (
    <article
      className={`cast-lite-dog-card cast-lite-dog-card--${mode} ${lowMotion ? "cast-lite-dog-card--low-motion" : ""}`}
    >
      <div className="cast-lite-dog-card__avatar" aria-hidden>
        {!failed && photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : initial ? (
          <span>{initial}</span>
        ) : (
          <Dog className="h-8 w-8" strokeWidth={1.75} />
        )}
      </div>
      <div className="cast-lite-dog-card__copy">
        <p className="cast-lite-dog-card__name">{dog.animal_name}</p>
        <p className="cast-lite-dog-card__meta">
          {personLabel}: {dog.owner_name ?? "—"}
        </p>
        {dog.room ? <p className="cast-lite-dog-card__room">{dog.room}</p> : null}
      </div>
    </article>
  );
});
