import { getServiceSupabase } from "@/lib/supabase/server";
import { splitPersonName } from "@/lib/card-studio/dynamic-fields";
import type { MemberCardContext } from "@/lib/card-studio/types";

export type MemberSearchHit = MemberCardContext & {
  source: "ops_dogs" | "fitdog_directory";
};

function sanitizeTerm(term: string) {
  return term.replace(/[,()]/g, " ").trim();
}

export async function searchCardStudioMembers(query: string, limit = 20): Promise<MemberSearchHit[]> {
  const term = sanitizeTerm(query);
  if (term.length < 2) return [];
  const pageSize = Math.min(40, Math.max(5, limit));
  const supabase = getServiceSupabase();
  const like = `%${term}%`;

  const [ops, dogs, customers] = await Promise.all([
    supabase
      .from("ops_dogs")
      .select("id, gingr_animal_id, fitdog_dog_id, name, owner_name, photo_url, breed")
      .or(`name.ilike.${like},owner_name.ilike.${like}`)
      .order("name", { ascending: true })
      .limit(pageSize),
    supabase
      .from("fitdog_dogs")
      .select("fitdog_dog_id, fitdog_owner_id, dog_name, breed")
      .or(`dog_name.ilike.${like}`)
      .order("dog_name", { ascending: true })
      .limit(pageSize),
    supabase
      .from("fitdog_customers")
      .select("fitdog_owner_id, owner_name, email, phone")
      .or(`owner_name.ilike.${like},email.ilike.${like}`)
      .order("owner_name", { ascending: true })
      .limit(pageSize)
  ]);

  const ownerById = new Map(
    (customers.data ?? []).map((row) => [
      String(row.fitdog_owner_id),
      {
        ownerName: String(row.owner_name ?? ""),
        email: row.email != null ? String(row.email) : null
      }
    ])
  );

  const hits: MemberSearchHit[] = [];
  const seen = new Set<string>();

  for (const row of ops.data ?? []) {
    const names = splitPersonName(String(row.owner_name ?? ""));
    const key = `ops:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      source: "ops_dogs",
      fitdogOwnerId: null,
      fitdogDogId: row.fitdog_dog_id ? String(row.fitdog_dog_id) : null,
      gingrAnimalId: row.gingr_animal_id ? String(row.gingr_animal_id) : null,
      opsDogId: String(row.id),
      name: String(row.owner_name ?? row.name ?? ""),
      firstName: names.firstName,
      lastName: names.lastName,
      email: null,
      memberNumber: row.gingr_animal_id ? `FD-${row.gingr_animal_id}` : null,
      membershipType: "Member",
      location: "Fitdog",
      status: "active",
      dogName: String(row.name ?? ""),
      dogBreed: row.breed != null ? String(row.breed) : null,
      photoUrl: row.photo_url != null ? String(row.photo_url) : null,
      issueDate: null,
      expirationDate: null,
      cardUuid: null,
      customField: null
    });
  }

  for (const row of dogs.data ?? []) {
    const ownerId = row.fitdog_owner_id != null ? String(row.fitdog_owner_id) : null;
    const owner = ownerId ? ownerById.get(ownerId) : null;
    const key = `fd:${ownerId ?? ""}:${row.fitdog_dog_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = splitPersonName(owner?.ownerName ?? "");
    hits.push({
      source: "fitdog_directory",
      fitdogOwnerId: ownerId,
      fitdogDogId: String(row.fitdog_dog_id),
      gingrAnimalId: null,
      opsDogId: null,
      name: owner?.ownerName || String(row.dog_name ?? ""),
      firstName: names.firstName,
      lastName: names.lastName,
      email: owner?.email ?? null,
      memberNumber: `FD-${row.fitdog_dog_id}`,
      membershipType: "Member",
      location: "Fitdog",
      status: "active",
      dogName: String(row.dog_name ?? ""),
      dogBreed: row.breed != null ? String(row.breed) : null,
      photoUrl: null,
      issueDate: null,
      expirationDate: null,
      cardUuid: null,
      customField: null
    });
  }

  return hits.slice(0, pageSize);
}
