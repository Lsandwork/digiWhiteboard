"use client";

import { memo, useState } from "react";
import { getLobbyCheckoutMergeKey } from "@/lib/lobby-display-stable";
import { toDisplayPhotoUrl } from "@/lib/gingr-photo-display";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";

type LobbyCheckoutShowcaseProps = {
  dogs: LobbyCheckoutDog[];
};

function realPhotoUrl(imageUrl?: string | null) {
  const trimmed = imageUrl?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.includes("fitdog-dog-logo")) return null;
  return trimmed;
}

function CheckoutDogPortrait({ dog, featured }: { dog: LobbyCheckoutDog; featured: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const displayUrl = toDisplayPhotoUrl(realPhotoUrl(dog.dog_photo_url), dog.gingr_animal_id);
  const showPhoto = Boolean(displayUrl) && !photoFailed;
  const detail = [dog.breed, dog.checkout_status].filter(Boolean).join(" • ");

  return (
    <article
      className={`lobby-checkout-dog checkout-entrance ${featured ? "lobby-checkout-dog--featured" : ""}`}
      data-dog={dog.dog_name}
    >
      <div className="lobby-checkout-dog__photo">
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl ?? undefined}
            alt={`Photo of ${dog.dog_name}`}
            className="lobby-checkout-dog__image"
            loading={featured ? "eager" : "lazy"}
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
            className="lobby-checkout-dog__fallback"
            draggable={false}
          />
        )}
      </div>
      <div className="lobby-checkout-dog__meta">
        <p className="lobby-checkout-dog__status">{featured ? "Checking out now" : "Checking out"}</p>
        <h2 className="lobby-checkout-dog__name" title={dog.dog_name}>
          {dog.dog_name}
        </h2>
        {detail ? <p className="lobby-checkout-dog__detail">{detail}</p> : null}
      </div>
    </article>
  );
}

export const LobbyCheckoutShowcase = memo(function LobbyCheckoutShowcase({ dogs }: LobbyCheckoutShowcaseProps) {
  if (!dogs.length) return null;

  return (
    <section
      className="lobby-checkout-showcase"
      data-count={Math.min(dogs.length, 6)}
      aria-label="Dogs checking out"
    >
      {dogs.slice(0, 6).map((dog, index) => (
        <CheckoutDogPortrait
          key={getLobbyCheckoutMergeKey(dog)}
          dog={dog}
          featured={index === 0}
        />
      ))}
    </section>
  );
});
