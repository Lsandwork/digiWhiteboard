"use client";

import { memo } from "react";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { getLobbyCheckoutMergeKey } from "@/lib/lobby-display-stable";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyQueueListProps = {
  dogs: LobbyCheckoutDog[];
};

export const LobbyQueueList = memo(function LobbyQueueList({ dogs }: LobbyQueueListProps) {
  if (!dogs.length) return null;

  return (
    <section className="lobby-queue lobby-queue--light" data-count={dogs.length}>
      <h3 className="lobby-queue__heading">Checking Out Next</h3>
      <div className="lobby-queue__list">
        {dogs.map((dog) => (
          <article key={getLobbyCheckoutMergeKey(dog)} className="lobby-panel lobby-queue-row flex items-center gap-4">
            <LobbyDogAvatar dogName={dog.dog_name} animalId={dog.gingr_animal_id} imageUrl={dog.dog_photo_url} />
            <div className="min-w-0 flex-1">
              <p className="lobby-queue-row__name truncate font-bold">{dog.dog_name}</p>
              {dog.breed ? <p className="lobby-queue-row__breed truncate">{dog.breed}</p> : null}
            </div>
            <p className="lobby-queue-row__status shrink-0 font-semibold">{dog.checkout_status}</p>
          </article>
        ))}
      </div>
    </section>
  );
});
