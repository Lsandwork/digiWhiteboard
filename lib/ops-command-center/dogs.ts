import { getServiceSupabase } from "@/lib/supabase/server";
import type { OpsDog } from "@/lib/ops-command-center/types";

type DogRow = Record<string, unknown>;

function gingrProfileUrlForAnimal(gingrAnimalId: string | null | undefined) {
  if (!gingrAnimalId) return null;
  // Gingr animal pages are opened via the local Gingr launcher when available.
  return `/gingr?animalId=${encodeURIComponent(gingrAnimalId)}`;
}

export function mapOpsDog(row: DogRow): OpsDog {
  return {
    id: String(row.id),
    gingrAnimalId: row.gingr_animal_id ? String(row.gingr_animal_id) : null,
    fitdogDogId: row.fitdog_dog_id ? String(row.fitdog_dog_id) : null,
    name: String(row.name || ""),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    ownerPhoneE164: row.owner_phone_e164 ? String(row.owner_phone_e164) : null,
    photoUrl: row.photo_url ? String(row.photo_url) : null,
    breed: row.breed ? String(row.breed) : null,
    specialInstructions: row.special_instructions ? String(row.special_instructions) : null,
    gingrProfileUrl: row.gingr_profile_url
      ? String(row.gingr_profile_url)
      : gingrProfileUrlForAnimal(row.gingr_animal_id ? String(row.gingr_animal_id) : null),
    lastGingrSyncAt: row.last_gingr_sync_at ? String(row.last_gingr_sync_at) : null,
    gingrSyncStale: Boolean(row.gingr_sync_stale),
    flags: (row.flags as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export type UpsertOpsDogInput = {
  gingrAnimalId?: string | null;
  fitdogDogId?: string | null;
  name?: string | null;
  ownerName?: string | null;
  ownerPhoneE164?: string | null;
  photoUrl?: string | null;
  breed?: string | null;
  specialInstructions?: string | null;
  flags?: Record<string, unknown>;
  markGingrSynced?: boolean;
};

/**
 * Resolve or create the RuffOps operational dog row.
 * Prefer gingr_animal_id. Never invent a competing Gingr pet record.
 */
export async function upsertOpsDog(input: UpsertOpsDogInput): Promise<OpsDog | null> {
  const supabase = getServiceSupabase();
  const gingrAnimalId = input.gingrAnimalId?.trim() || null;
  const fitdogDogId = input.fitdogDogId?.trim() || null;
  const name = (input.name || "").trim();

  if (!gingrAnimalId && !fitdogDogId && !name) return null;

  let existing: DogRow | null = null;
  if (gingrAnimalId) {
    const { data } = await supabase
      .from("ops_dogs")
      .select("*")
      .eq("gingr_animal_id", gingrAnimalId)
      .maybeSingle();
    existing = data;
  }
  if (!existing && fitdogDogId) {
    const { data } = await supabase
      .from("ops_dogs")
      .select("*")
      .eq("fitdog_dog_id", fitdogDogId)
      .maybeSingle();
    existing = data;
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updated_at: now
  };
  if (gingrAnimalId) patch.gingr_animal_id = gingrAnimalId;
  if (fitdogDogId) patch.fitdog_dog_id = fitdogDogId;
  if (name) patch.name = name;
  if (input.ownerName !== undefined) patch.owner_name = input.ownerName?.trim() || null;
  if (input.ownerPhoneE164 !== undefined) patch.owner_phone_e164 = input.ownerPhoneE164 || null;
  if (input.photoUrl !== undefined) patch.photo_url = input.photoUrl || null;
  if (input.breed !== undefined) patch.breed = input.breed || null;
  if (input.specialInstructions !== undefined) {
    patch.special_instructions = input.specialInstructions || null;
  }
  if (input.flags) patch.flags = input.flags;
  if (gingrAnimalId) patch.gingr_profile_url = gingrProfileUrlForAnimal(gingrAnimalId);
  if (input.markGingrSynced) {
    patch.last_gingr_sync_at = now;
    patch.gingr_sync_stale = false;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("ops_dogs")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) return existing ? mapOpsDog(existing) : null;
    return mapOpsDog(data);
  }

  const { data, error } = await supabase
    .from("ops_dogs")
    .insert({
      gingr_animal_id: gingrAnimalId,
      fitdog_dog_id: fitdogDogId,
      name: name || "Unknown dog",
      owner_name: input.ownerName?.trim() || null,
      owner_phone_e164: input.ownerPhoneE164 || null,
      photo_url: input.photoUrl || null,
      breed: input.breed || null,
      special_instructions: input.specialInstructions || null,
      flags: input.flags || {},
      gingr_profile_url: gingrProfileUrlForAnimal(gingrAnimalId),
      last_gingr_sync_at: input.markGingrSynced ? now : null,
      gingr_sync_stale: false
    })
    .select("*")
    .single();
  if (error || !data) return null;
  return mapOpsDog(data);
}

export async function getOpsDogById(dogId: string): Promise<OpsDog | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("ops_dogs").select("*").eq("id", dogId).maybeSingle();
  return data ? mapOpsDog(data) : null;
}

export async function getOpsDogByGingrAnimalId(gingrAnimalId: string): Promise<OpsDog | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("ops_dogs")
    .select("*")
    .eq("gingr_animal_id", gingrAnimalId)
    .maybeSingle();
  return data ? mapOpsDog(data) : null;
}

export async function searchOpsDogs(query: string, limit = 20): Promise<OpsDog[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = getServiceSupabase();
  const like = `%${q}%`;
  const { data } = await supabase
    .from("ops_dogs")
    .select("*")
    .or(`name.ilike.${like},owner_name.ilike.${like},gingr_animal_id.eq.${q}`)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  return (data ?? []).map(mapOpsDog);
}
