"use client";

import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyQueueListProps = {
  dogs: LobbyCheckoutDog[];
};

export function LobbyQueueList({ dogs }: LobbyQueueListProps) {
  if (!dogs.length) return null;

  return (
    <section className="lobby-queue">
      <h3 className="mb-3 text-lg font-black uppercase tracking-[0.16em] text-white">Checking Out Next</h3>
      <div className="space-y-2">
        {dogs.map((dog) => (
          <article key={dog.id} className="lobby-panel lobby-queue-row flex items-center gap-4 rounded-xl px-4 py-3">
            <LobbyDogAvatar dogName={dog.dog_name} animalId={dog.gingr_animal_id} imageUrl={dog.dog_photo_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-bold text-white">{dog.dog_name}</p>
              {dog.breed ? <p className="truncate text-sm text-lobby-muted">{dog.breed}</p> : null}
            </div>
            <p className="shrink-0 text-sm font-semibold text-lobby-teal">{dog.checkout_status}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
