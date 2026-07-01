"use client";

import Image from "next/image";
import { lobbyAssets, lobbyStatusAsset } from "@/lib/lobby/assets";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
};

export function LobbyFeaturedCard({ dog }: LobbyFeaturedCardProps) {
  return (
    <section className="lobby-panel lobby-featured-card relative overflow-hidden rounded-2xl p-5">
      <div className="relative z-10 flex items-center gap-6">
        <LobbyDogAvatar dogName={dog.dog_name} imageUrl={dog.dog_photo_url} size="featured" />
        <div className="min-w-0 flex-1">
          <Image
            src={lobbyStatusAsset(dog.checkout_status)}
            alt={dog.checkout_status}
            width={280}
            height={56}
            className="h-11 w-auto"
            unoptimized
          />
          <h2 className="mt-2 text-5xl font-black text-white">{dog.dog_name}</h2>
          {dog.breed ? <p className="mt-1 text-xl text-lobby-muted">{dog.breed}</p> : null}
          <p className="mt-3 inline-flex rounded-full border border-lobby-orange/40 bg-lobby-orange/15 px-4 py-1.5 text-base font-semibold text-orange-50">
            {dog.checkout_status}
          </p>
        </div>
      </div>
    </section>
  );
}
