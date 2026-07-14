"use client";

import { memo } from "react";
import Image from "next/image";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";
import { lobbyLightAssets } from "@/lib/lobby/assets";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
};

function formatPromptedTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles"
  });
}

export const LobbyFeaturedCard = memo(function LobbyFeaturedCard({ dog }: LobbyFeaturedCardProps) {
  const promptedLabel = formatPromptedTime(dog.prompted_at);
  const detailLine = [dog.breed, dog.checkout_status].filter(Boolean).join(" • ");

  return (
    <section className="lobby-panel lobby-featured-card lobby-featured-card--light relative overflow-hidden">
      <Image
        src={lobbyLightAssets.watermarkPaw}
        alt=""
        width={180}
        height={180}
        className="lobby-featured-card__watermark"
        aria-hidden
        unoptimized
      />
      <div className="lobby-featured-card__inner relative z-10 flex items-center gap-5">
        <LobbyDogAvatar
          dogName={dog.dog_name}
          animalId={dog.gingr_animal_id}
          imageUrl={dog.dog_photo_url}
          size="featured"
        />
        <div className="min-w-0 flex-1">
          <p className="lobby-featured-card__status">
            <Image src={lobbyLightAssets.pawSolidOrange} alt="" width={22} height={22} className="h-5 w-5 object-contain" unoptimized />
            Checking Out Now!
          </p>
          <h2 className="lobby-featured-card__name" title={dog.dog_name}>
            {dog.dog_name}
            <Image
              src={lobbyLightAssets.heartOrange}
              alt=""
              width={28}
              height={28}
              className="lobby-featured-card__name-heart"
              unoptimized
            />
          </h2>
          {detailLine ? <p className="lobby-featured-card__breed">{detailLine}</p> : null}

          <div className="lobby-featured-card__stats">
            {promptedLabel ? (
              <div>
                <span className="lobby-featured-card__stat-label">Check-out</span>
                <strong>{promptedLabel}</strong>
              </div>
            ) : null}
            <div>
              <span className="lobby-featured-card__stat-label">Thank you!</span>
              <strong>We can&apos;t wait to see you again!</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
