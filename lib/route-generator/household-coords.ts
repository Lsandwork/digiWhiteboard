/**
 * Household keys gain `::` suffixes for service/timing windows and again when
 * drop-off is split across vans (`lockDropoffGroupsToPickupVans`). Coords are
 * keyed by the pre-split key, so a naive `split("::")[0]` lookup misses and
 * drop-off stops land with null lat/lng — which Samsara then rejects.
 */

export type LatLng = { lat: number; lng: number };

/** Every prefix of a `::`-suffixed household key, longest first. */
export function householdKeyPrefixes(householdKey: string): string[] {
  const key = String(householdKey || "").trim();
  if (!key) return [];
  const parts = key.split("::");
  const out: string[] = [key];
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    out.push(parts.slice(0, i).join("::"));
  }
  return out;
}

/** True when two keys share the same address/facility stem (ignore timing/van suffixes). */
export function householdKeysShareStem(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a || "").split("::")[0] || "";
  const right = String(b || "").split("::")[0] || "";
  return Boolean(left && right && left === right);
}

/**
 * Find coords for a (possibly split) household key by walking its `::` prefixes.
 * Returns null when nothing in the map matches.
 */
export function lookupCoordsByHouseholdKey(
  coords: Record<string, LatLng>,
  householdKey: string
): LatLng | null {
  for (const candidate of householdKeyPrefixes(householdKey)) {
    const hit = coords[candidate];
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return hit;
  }
  return null;
}

/**
 * After drop-off keys are rewritten with `::van_N`, copy coords from the
 * pre-split key into the new key so the optimizer does not emit null lat/lng.
 * Returns how many keys were filled.
 */
export function copyCoordsForSplitHouseholdKeys(
  coords: Record<string, LatLng>,
  householdKeys: string[]
): number {
  let copied = 0;
  for (const key of householdKeys) {
    if (!key || coords[key]) continue;
    const found = lookupCoordsByHouseholdKey(coords, key);
    if (!found) continue;
    coords[key] = found;
    copied += 1;
  }
  return copied;
}

export function hasFiniteCoords(lat: unknown, lng: unknown): boolean {
  const latN = typeof lat === "number" ? lat : Number(lat);
  const lngN = typeof lng === "number" ? lng : Number(lng);
  return Number.isFinite(latN) && Number.isFinite(lngN) && !(Math.abs(latN) < 1e-4 && Math.abs(lngN) < 1e-4);
}
