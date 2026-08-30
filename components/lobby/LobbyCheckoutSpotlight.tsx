"use client";

import { memo, useMemo, useState } from "react";
import { toDisplayPhotoUrl } from "@/lib/gingr-photo-display";
import { lobbyLightAssets } from "@/lib/lobby/assets";
import {
  buildCheckoutDaySummary,
  buildCheckoutFunFacts
} from "@/lib/lobby/checkout-spotlight-fun-facts";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";

const FITDOG_LOGO = lobbyLightAssets.dogLogoExact;
const FITDOG_FALLBACK = lobbyLightAssets.dogLogoExact;

function realPhotoUrl(imageUrl?: string | null) {
  const trimmed = imageUrl?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.includes("fitdog-dog-logo")) return null;
  return trimmed;
}

function SpotlightDogPhoto({
  dog,
  large
}: {
  dog: LobbyCheckoutDog;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const displayUrl = toDisplayPhotoUrl(realPhotoUrl(dog.dog_photo_url), dog.gingr_animal_id);
  const showPhoto = Boolean(displayUrl) && !failed;

  return (
    <div className={`lobby-spotlight-photo ${large ? "lobby-spotlight-photo--large" : ""}`}>
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayUrl ?? undefined}
          alt={`Photo of ${dog.dog_name}`}
          className="lobby-spotlight-photo__img"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={FITDOG_FALLBACK}
          alt=""
          className="lobby-spotlight-photo__fallback"
          draggable={false}
        />
      )}
    </div>
  );
}

function SpotlightDogPanel({ dog, dual }: { dog: LobbyCheckoutDog; dual: boolean }) {
  const facts = useMemo(
    () =>
      buildCheckoutFunFacts({
        dogName: dog.dog_name,
        animalId: dog.gingr_animal_id,
        breed: dog.breed,
        count: dual ? 4 : 5
      }),
    [dog.breed, dog.dog_name, dog.gingr_animal_id, dual]
  );
  const summary = useMemo(
    () =>
      buildCheckoutDaySummary({
        dogName: dog.dog_name,
        animalId: dog.gingr_animal_id
      }),
    [dog.dog_name, dog.gingr_animal_id]
  );

  return (
    <article className={`lobby-spotlight-dog ${dual ? "lobby-spotlight-dog--dual" : ""}`}>
      <SpotlightDogPhoto dog={dog} large={!dual} />
      <div className="lobby-spotlight-dog__copy">
        <p className="lobby-spotlight-dog__status">Checked Out!</p>
        <h2 className="lobby-spotlight-dog__name">{dog.dog_name}</h2>
        {dog.breed ? <p className="lobby-spotlight-dog__breed">{dog.breed}</p> : null}

        <div className="lobby-spotlight-facts" data-testid="checkout-spotlight-fun-facts">
          <h3 className="lobby-spotlight-facts__title">Today&apos;s Fun Facts</h3>
          <ul className="lobby-spotlight-facts__list">
            {facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>

        {!dual ? (
          <div className="lobby-spotlight-summary" aria-label="Playful day summary">
            <p className="lobby-spotlight-summary__label">Today&apos;s Summary</p>
            <div className="lobby-spotlight-summary__grid">
              <div>
                <span>Attitude</span>
                <strong>{summary.attitude}</strong>
              </div>
              <div>
                <span>Energy Level</span>
                <strong>{summary.energyLevel}</strong>
              </div>
              <div>
                <span>Friendship</span>
                <strong>{summary.friendship}</strong>
              </div>
              <div>
                <span>Zoomies</span>
                <strong>{summary.zoomies}</strong>
              </div>
              <div>
                <span>Nap Time</span>
                <strong>{summary.napTime}</strong>
              </div>
              <div>
                <span>Overall Day</span>
                <strong>{summary.overallDay}</strong>
              </div>
            </div>
            <p className="lobby-spotlight-summary__note">Playful estimates. Not a scientific evaluation.</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type LobbyCheckoutSpotlightProps = {
  dogs: LobbyCheckoutDog[];
};

export const LobbyCheckoutSpotlight = memo(function LobbyCheckoutSpotlight({
  dogs
}: LobbyCheckoutSpotlightProps) {
  const dual = dogs.length > 1;
  if (!dogs.length) return null;

  return (
    <section
      className={`lobby-checkout-spotlight ${dual ? "lobby-checkout-spotlight--dual" : ""}`}
      aria-live="polite"
      aria-label="Check-out spotlight"
    >
      <header className="lobby-checkout-spotlight__header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FITDOG_LOGO}
          alt="FitDog"
          className="lobby-checkout-spotlight__logo"
          draggable={false}
        />
        <div>
          <p className="lobby-checkout-spotlight__eyebrow">Check-out Spotlight</p>
          <p className="lobby-checkout-spotlight__sub">
            {dual ? "Two legends leaving the building" : "One legend leaving the building"}
          </p>
        </div>
      </header>

      <div className={`lobby-checkout-spotlight__stage ${dual ? "lobby-checkout-spotlight__stage--dual" : ""}`}>
        {dogs.slice(0, 2).map((dog) => (
          <SpotlightDogPanel key={`${dog.id}-${dog.prompted_at}`} dog={dog} dual={dual} />
        ))}
      </div>
    </section>
  );
});
