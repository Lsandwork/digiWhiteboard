import { getServiceSupabase } from "@/lib/supabase/server";
import { splitPersonName } from "@/lib/card-studio/dynamic-fields";
import { emptyMemberContext } from "@/lib/card-studio/dynamic-fields";
import {
  DEFAULT_PRODUCTION_BARCODE_SOURCE,
  extractGingrOwnerBarcode,
  gingrBarcodeValue,
  normalizeGingrNumericId,
  typedMemberId
} from "@/lib/card-studio/gingr-identity";
import { createGingrClient, unwrapGingrData } from "@/lib/integrations/gingr/client";
import type { MemberCardContext } from "@/lib/card-studio/types";

export type MemberSearchHit = MemberCardContext & {
  source: "ops_dogs" | "fitdog_directory";
};

function sanitizeTerm(term: string) {
  return term.replace(/[,()]/g, " ").trim();
}

function baseHit(): MemberCardContext {
  return {
    ...emptyMemberContext(),
    barcodeSource: DEFAULT_PRODUCTION_BARCODE_SOURCE
  };
}

function withBarcode(member: MemberCardContext): MemberCardContext {
  const animalId = normalizeGingrNumericId(member.gingrAnimalId);
  return {
    ...member,
    gingrAnimalId: animalId,
    gingrOwnerId: normalizeGingrNumericId(member.gingrOwnerId),
    memberNumber: typedMemberId(member.memberNumber) ?? typedMemberId(member.gingrOwnerBarcode),
    barcodeSource: DEFAULT_PRODUCTION_BARCODE_SOURCE,
    barcodeValue: gingrBarcodeValue({ ...member, gingrAnimalId: animalId })
  };
}

async function gingrOwnerByAnimalIds(animalIds: string[]) {
  const map = new Map<string, { gingrOwnerId: string | null }>();
  if (!animalIds.length) return map;
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("ruffly_contact_dogs")
      .select("gingr_animal_id, contact_id")
      .in("gingr_animal_id", animalIds);
    const contactIds = [...new Set((data ?? []).map((row) => String(row.contact_id)).filter(Boolean))];
    const ownerByContact = new Map<string, string>();
    if (contactIds.length) {
      const { data: contacts } = await supabase
        .from("ruffly_contacts")
        .select("id, gingr_owner_id")
        .in("id", contactIds);
      for (const row of contacts ?? []) {
        const ownerId = normalizeGingrNumericId(row.gingr_owner_id != null ? String(row.gingr_owner_id) : null);
        if (ownerId) ownerByContact.set(String(row.id), ownerId);
      }
    }
    for (const row of data ?? []) {
      const animalId = normalizeGingrNumericId(row.gingr_animal_id != null ? String(row.gingr_animal_id) : null);
      if (!animalId) continue;
      map.set(animalId, { gingrOwnerId: ownerByContact.get(String(row.contact_id)) ?? null });
    }
  } catch {
    return map;
  }
  return map;
}

export async function searchCardStudioMembers(query: string, limit = 20): Promise<MemberSearchHit[]> {
  const term = sanitizeTerm(query);
  if (term.length < 2) return [];
  const pageSize = Math.min(40, Math.max(5, limit));
  const supabase = getServiceSupabase();
  const like = `%${term}%`;
  const gingrId = normalizeGingrNumericId(term);
  const gingrFilter = gingrId
    ? `,gingr_animal_id.eq.${gingrId},gingr_animal_id.eq.${term}`
    : `,gingr_animal_id.eq.${term}`;

  const [ops, dogs, customers] = await Promise.all([
    supabase
      .from("ops_dogs")
      .select("id, gingr_animal_id, fitdog_dog_id, name, owner_name, photo_url, breed, owner_phone_e164")
      .or(`name.ilike.${like},owner_name.ilike.${like},owner_phone_e164.ilike.${like}${gingrFilter}`)
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
      .or(`owner_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .order("owner_name", { ascending: true })
      .limit(pageSize)
  ]);

  const ownerById = new Map(
    (customers.data ?? []).map((row) => [
      String(row.fitdog_owner_id),
      {
        ownerName: String(row.owner_name ?? ""),
        email: row.email != null ? String(row.email) : null,
        phone: row.phone != null ? String(row.phone) : null
      }
    ])
  );

  const fitdogIds = (dogs.data ?? []).map((row) => String(row.fitdog_dog_id)).filter(Boolean);
  const gingrByFitdog = new Map<
    string,
    { gingrAnimalId: string | null; opsDogId: string | null; photoUrl: string | null; phone: string | null }
  >();
  if (fitdogIds.length) {
    const { data: linked } = await supabase
      .from("ops_dogs")
      .select("id, gingr_animal_id, fitdog_dog_id, photo_url, owner_phone_e164")
      .in("fitdog_dog_id", fitdogIds);
    for (const row of linked ?? []) {
      gingrByFitdog.set(String(row.fitdog_dog_id), {
        gingrAnimalId: normalizeGingrNumericId(row.gingr_animal_id != null ? String(row.gingr_animal_id) : null),
        opsDogId: String(row.id),
        photoUrl: row.photo_url != null ? String(row.photo_url) : null,
        phone: row.owner_phone_e164 != null ? String(row.owner_phone_e164) : null
      });
    }
  }

  const hits: MemberSearchHit[] = [];
  const seen = new Set<string>();
  const animalIds: string[] = [];

  for (const row of ops.data ?? []) {
    const names = splitPersonName(String(row.owner_name ?? ""));
    const key = `ops:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const gingrAnimalId = normalizeGingrNumericId(row.gingr_animal_id != null ? String(row.gingr_animal_id) : null);
    if (gingrAnimalId) animalIds.push(gingrAnimalId);
    hits.push({
      ...withBarcode({
        ...baseHit(),
        fitdogDogId: row.fitdog_dog_id ? String(row.fitdog_dog_id) : null,
        gingrAnimalId,
        opsDogId: String(row.id),
        name: String(row.owner_name ?? row.name ?? ""),
        firstName: names.firstName,
        lastName: names.lastName,
        phone: row.owner_phone_e164 != null ? String(row.owner_phone_e164) : null,
        dogName: String(row.name ?? ""),
        dogBreed: row.breed != null ? String(row.breed) : null,
        photoUrl: row.photo_url != null ? String(row.photo_url) : null
      }),
      source: "ops_dogs"
    });
  }

  for (const row of dogs.data ?? []) {
    const ownerId = row.fitdog_owner_id != null ? String(row.fitdog_owner_id) : null;
    const owner = ownerId ? ownerById.get(ownerId) : null;
    const key = `fd:${ownerId ?? ""}:${row.fitdog_dog_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const names = splitPersonName(owner?.ownerName ?? "");
    const linked = gingrByFitdog.get(String(row.fitdog_dog_id));
    const gingrAnimalId = linked?.gingrAnimalId ?? null;
    if (gingrAnimalId) animalIds.push(gingrAnimalId);
    hits.push({
      ...withBarcode({
        ...baseHit(),
        fitdogOwnerId: ownerId,
        fitdogDogId: String(row.fitdog_dog_id),
        gingrAnimalId,
        opsDogId: linked?.opsDogId ?? null,
        name: owner?.ownerName || String(row.dog_name ?? ""),
        firstName: names.firstName,
        lastName: names.lastName,
        email: owner?.email ?? null,
        phone: owner?.phone ?? linked?.phone ?? null,
        dogName: String(row.dog_name ?? ""),
        dogBreed: row.breed != null ? String(row.breed) : null,
        photoUrl: linked?.photoUrl ?? null
      }),
      source: "fitdog_directory"
    });
  }

  const owners = await gingrOwnerByAnimalIds([...new Set(animalIds)]);
  for (const hit of hits) {
    if (!hit.gingrAnimalId) continue;
    const linked = owners.get(hit.gingrAnimalId);
    if (linked?.gingrOwnerId) hit.gingrOwnerId = linked.gingrOwnerId;
  }
  await attachGingrOwnerBarcodes(hits);
  for (const hit of hits) {
    hit.barcodeSource = DEFAULT_PRODUCTION_BARCODE_SOURCE;
    hit.barcodeValue = gingrBarcodeValue(hit);
  }

  return hits.slice(0, pageSize);
}

async function attachGingrOwnerBarcodes(hits: MemberSearchHit[]) {
  const ownerIds = [...new Set(hits.map((hit) => hit.gingrOwnerId).filter((id): id is string => Boolean(id)))];
  if (!ownerIds.length || !process.env.GINGR_API_KEY?.trim()) return;
  try {
    const client = createGingrClient();
    const barcodes = new Map<string, string>();
    await Promise.all(
      ownerIds.slice(0, 12).map(async (ownerId) => {
        try {
          const barcode = extractGingrOwnerBarcode(unwrapGingrData(await client.getOwner(ownerId)));
          if (barcode) barcodes.set(ownerId, barcode);
        } catch {
          // Live Gingr lookup is best-effort during search; print still requires a valid owner barcode.
        }
      })
    );
    for (const hit of hits) {
      if (hit.gingrOwnerId && barcodes.has(hit.gingrOwnerId)) {
        hit.gingrOwnerBarcode = barcodes.get(hit.gingrOwnerId) ?? null;
      }
    }
  } catch {
    return;
  }
}

export async function lookupGingrRecord(input: {
  gingrAnimalId?: string | null;
  gingrOwnerId?: string | null;
  live?: boolean;
}) {
  const animalId = normalizeGingrNumericId(input.gingrAnimalId);
  const ownerId = normalizeGingrNumericId(input.gingrOwnerId);
  if (!animalId && !ownerId) {
    return {
      kind: "none" as const,
      ok: false,
      dogName: null as string | null,
      ownerName: null as string | null,
      gingrAnimalId: null as string | null,
      gingrOwnerId: null as string | null,
      gingrOwnerBarcode: null as string | null,
      message: "No Gingr animal or owner ID to look up."
    };
  }

  const supabase = getServiceSupabase();
  let dogName: string | null = null;
  let ownerName: string | null = null;
  let gingrOwnerId = ownerId;
  let gingrOwnerBarcode: string | null = null;

  if (animalId) {
    const { data: dog } = await supabase
      .from("ops_dogs")
      .select("name, owner_name, gingr_animal_id")
      .eq("gingr_animal_id", animalId)
      .maybeSingle();
    if (dog) {
      dogName = String(dog.name ?? "") || null;
      ownerName = dog.owner_name != null ? String(dog.owner_name) : null;
    }
    const owners = await gingrOwnerByAnimalIds([animalId]);
    gingrOwnerId = owners.get(animalId)?.gingrOwnerId ?? gingrOwnerId;
  }

  const localOk = Boolean(dogName || ownerName || gingrOwnerId);

  if (input.live) {
    try {
      const client = createGingrClient();
      if (animalId) {
        const animal = unwrapGingrData(await client.getAnimal(animalId));
        const record = animal && typeof animal === "object" && !Array.isArray(animal) ? (animal as Record<string, unknown>) : null;
        if (record) {
          const nested = record.data;
          const row = nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;
          dogName = String(row.name ?? row.a_name ?? row.animal_name ?? dogName ?? "") || dogName;
          gingrOwnerId = normalizeGingrNumericId(row.owner_id != null ? String(row.owner_id) : gingrOwnerId) ?? gingrOwnerId;
        }
      }
      if (gingrOwnerId) {
        const owner = unwrapGingrData(await client.getOwner(gingrOwnerId));
        const record = owner && typeof owner === "object" && !Array.isArray(owner) ? (owner as Record<string, unknown>) : null;
        if (record) {
          const nested = record.data;
          const row = nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;
          const first = String(row.first_name ?? row.o_first ?? "");
          const last = String(row.last_name ?? row.o_last ?? "");
          ownerName = `${first} ${last}`.trim() || ownerName;
          gingrOwnerBarcode = extractGingrOwnerBarcode(owner) ?? extractGingrOwnerBarcode(row);
        }
      }
      return {
        kind: "gingr_api" as const,
        ok: Boolean(dogName || ownerName || gingrOwnerBarcode),
        dogName,
        ownerName,
        gingrAnimalId: animalId,
        gingrOwnerId,
        gingrOwnerBarcode,
        message: dogName || ownerName
          ? "GINGR RECORD VERIFICATION: live Gingr API returned this animal/owner."
          : "GINGR RECORD VERIFICATION: Gingr API responded but did not return a matching animal/owner."
      };
    } catch (error) {
      return {
        kind: localOk ? ("local_cache" as const) : ("none" as const),
        ok: localOk,
        dogName,
        ownerName,
        gingrAnimalId: animalId,
        gingrOwnerId,
        gingrOwnerBarcode,
        message: localOk
          ? `LOCAL BARCODE VALIDATION / GINGR RECORD CACHE only. Live Gingr API was not verified (${error instanceof Error ? error.message : "unavailable"}).`
          : "Gingr identification data is missing for this member. The card cannot be printed until the member's Gingr identification data is available."
      };
    }
  }

  return {
    kind: localOk ? ("local_cache" as const) : ("none" as const),
    ok: localOk,
    dogName,
    ownerName,
    gingrAnimalId: animalId,
    gingrOwnerId,
    gingrOwnerBarcode,
    message: localOk
      ? "LOCAL BARCODE VALIDATION: matched RuffOps Gingr sync cache (ops_dogs / ruffly). This is not a live Gingr API verification."
      : "Gingr identification data is missing for this member. The card cannot be printed until the member's Gingr identification data is available."
  };
}
