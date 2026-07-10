import { getRememberedDogPhoto, rememberStableDogPhoto } from "@/lib/dog-photo-display-cache";
import type { LobbyCheckoutDog, LobbyCheckoutsResponse } from "@/lib/lobby/types";

const nameByKey = new Map<string, string>();

export function getLobbyCheckoutMergeKey(dog: Pick<LobbyCheckoutDog, "id" | "gingr_animal_id">) {
  if (dog.gingr_animal_id) return `animal:${dog.gingr_animal_id}`;
  return `id:${dog.id}`;
}

export function rememberStableLobbyDogName(key: string, name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return;
  nameByKey.set(key, trimmed);
}

export function getRememberedLobbyDogName(key: string) {
  return nameByKey.get(key) ?? null;
}

export function stabilizeLobbyCheckoutDog(dog: LobbyCheckoutDog): LobbyCheckoutDog {
  const key = getLobbyCheckoutMergeKey(dog);
  const incomingName = dog.dog_name?.trim() || null;
  const incomingPhoto = dog.dog_photo_url?.trim() || null;

  if (incomingName) rememberStableLobbyDogName(key, incomingName);
  if (incomingPhoto) rememberStableDogPhoto(key, incomingPhoto);

  return {
    ...dog,
    dog_name: getRememberedLobbyDogName(key) ?? incomingName ?? dog.dog_name,
    dog_photo_url: getRememberedDogPhoto(key) ?? incomingPhoto ?? dog.dog_photo_url
  };
}

export function stabilizeLobbyCheckoutsResponse(response: LobbyCheckoutsResponse): LobbyCheckoutsResponse {
  return {
    ...response,
    featured: response.featured ? stabilizeLobbyCheckoutDog(response.featured) : null,
    queue: (response.queue ?? []).map(stabilizeLobbyCheckoutDog)
  };
}

export function areLobbyCheckoutsDisplayEqual(a: LobbyCheckoutsResponse, b: LobbyCheckoutsResponse) {
  const featuredEqual =
    (!a.featured && !b.featured) ||
    Boolean(
      a.featured &&
        b.featured &&
        getLobbyCheckoutMergeKey(a.featured) === getLobbyCheckoutMergeKey(b.featured) &&
        a.featured.dog_name === b.featured.dog_name &&
        (a.featured.dog_photo_url ?? null) === (b.featured.dog_photo_url ?? null)
    );

  if (!featuredEqual) return false;
  if ((a.queue?.length ?? 0) !== (b.queue?.length ?? 0)) return false;

  for (let index = 0; index < (a.queue?.length ?? 0); index += 1) {
    const left = a.queue![index]!;
    const right = b.queue![index]!;
    if (getLobbyCheckoutMergeKey(left) !== getLobbyCheckoutMergeKey(right)) return false;
    if (left.dog_name !== right.dog_name) return false;
    if ((left.dog_photo_url ?? null) !== (right.dog_photo_url ?? null)) return false;
  }

  return true;
}

function mergeLobbyDogFields(existing: LobbyCheckoutDog, incoming: LobbyCheckoutDog): LobbyCheckoutDog {
  const key = getLobbyCheckoutMergeKey(existing);
  const mergedPhoto = existing.dog_photo_url?.trim() || incoming.dog_photo_url?.trim() || null;
  const mergedName = existing.dog_name?.trim() || incoming.dog_name?.trim() || existing.dog_name;

  if (mergedName) rememberStableLobbyDogName(key, mergedName);
  if (mergedPhoto) rememberStableDogPhoto(key, mergedPhoto);

  return stabilizeLobbyCheckoutDog({
    ...existing,
    ...incoming,
    id: existing.id,
    dog_name: mergedName,
    dog_photo_url: mergedPhoto,
    breed: existing.breed?.trim() || incoming.breed?.trim() || existing.breed
  });
}

export { mergeLobbyDogFields };
