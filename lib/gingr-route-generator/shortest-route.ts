/**
 * Distance-only route order (no traffic). Nearest-neighbor + 2-opt so
 * Gingr home stops do not zigzag across the city before Samsara export.
 */

export type GeoPoint = { latitude: number; longitude: number };

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineMiles(a: GeoPoint, b: GeoPoint): number {
  const r = 3958.8;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathLength(points: GeoPoint[]): number {
  let miles = 0;
  for (let i = 1; i < points.length; i += 1) {
    miles += haversineMiles(points[i - 1]!, points[i]!);
  }
  return miles;
}

function nearestNeighbor(stops: GeoPoint[], start: GeoPoint | null): number[] {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let cursor = start;
  while (remaining.length) {
    let bestIdx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const stop = stops[remaining[i]!]!;
      const miles = cursor ? haversineMiles(cursor, stop) : 0;
      if (miles < best) {
        best = miles;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0]!;
    order.push(chosen);
    cursor = stops[chosen]!;
  }
  return order;
}

function twoOpt(stops: GeoPoint[], order: number[], start: GeoPoint | null, end: GeoPoint | null): number[] {
  const next = [...order];
  const score = (perm: number[]) => {
    const points: GeoPoint[] = [];
    if (start) points.push(start);
    for (const i of perm) points.push(stops[i]!);
    if (end) points.push(end);
    return pathLength(points);
  };
  let improved = true;
  let guard = 0;
  while (improved && guard < 80) {
    improved = false;
    guard += 1;
    for (let i = 0; i < next.length - 1; i += 1) {
      for (let k = i + 1; k < next.length; k += 1) {
        if (i === 0 && k === next.length - 1) continue;
        const candidate = [...next.slice(0, i), ...next.slice(i, k + 1).reverse(), ...next.slice(k + 1)];
        if (score(candidate) + 0.05 < score(next)) {
          next.splice(0, next.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return next;
}

/** Reorder stops for the shortest depot → homes → depot path. */
export function orderStopsByShortestPath<T extends GeoPoint>(
  stops: T[],
  start: GeoPoint | null,
  end: GeoPoint | null
): T[] {
  if (stops.length <= 1) return stops;
  const seed = nearestNeighbor(stops, start);
  const improved = twoOpt(stops, seed, start, end);
  return improved.map((i) => stops[i]!);
}
