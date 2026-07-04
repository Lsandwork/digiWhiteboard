"use client";

import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
};

export function LobbyFeaturedCard({ dog }: LobbyFeaturedCardProps) {
  return (
    <section className="lobby-panel lobby-featured-card relative overflow-hidden rounded-2xl border-l-[6px] border-l-lobby-orange">
      <div className="lobby-featured-card__inner relative z-10 flex items-center">
        <LobbyDogAvatar
          dogName={dog.dog_name}
          animalId={dog.gingr_animal_id}
          imageUrl={dog.dog_photo_url}
          size="featured"
        />
        <div className="min-w-0 flex-1">
          <p className="lobby-featured-card__status font-black uppercase tracking-[0.28em] text-lobby-orange">
            {dog.checkout_status}
          </p>
          <h2 className="lobby-featured-card__name mt-2 font-black leading-none text-white">{dog.dog_name}</h2>
          {dog.breed ? <p className="lobby-featured-card__breed mt-2 text-lobby-muted">{dog.breed}</p> : null}
        </div>
      </div>
    </section>
  );
}
