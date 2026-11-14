/**
 * Parse Gingr "Service Addons" PDF / print reports where each Before and After
 * addon is often its own row. Rows for the same dog, owner, activity, and
 * booked type merge into one booking before import.
 */

import type { MappedUploadRow } from "@/lib/gingr-route-generator/import-file";
import { looksLikeServiceAddonLabel, normalizeServiceAddonLabel } from "@/lib/gingr-route-generator/service-addon-labels";

const NOISE =
  /^(results|service addons|additional|animal|owner|type|lodging|start date|end date|notes|assigned to|scheduled at|addon completed|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;

function isNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (NOISE.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed)) return true;
  if (/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(trimmed)) return true;
  if (/\bvan\b/i.test(trimmed) && !looksLikeServiceAddonLabel(trimmed)) return true;
  if (/^suite:/i.test(trimmed)) return true;
  return false;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bookingMergeKey(row: {
  dogName: string;
  ownerName: string;
  reservationType: string | null;
  date: string | null;
}): string {
  const type = row.reservationType || "";
  return [normalizeName(row.dogName), normalizeName(row.ownerName), normalizeName(type), row.date || ""]
    .filter(Boolean)
    .join("|");
}

function mergeAddonLines(head: string, tail: string | null): string {
  return normalizeServiceAddonLabel([head, tail].filter(Boolean).join(" "));
}

function readAddon(lines: string[], start: number): { addon: string; next: number } {
  let addon = lines[start]!.trim();
  let next = start + 1;
  const complete =
    /@\s*(Home|Fitdog Club)/i.test(addon) || /^Boarding @ Fitdog Club/i.test(addon) || /^Boarding @/i.test(addon);
  if (
    !complete &&
    next < lines.length &&
    (/-\s*Fitdog to\s*$/i.test(addon) ||
      /-\s*Owner To\s*$/i.test(addon) ||
      /Owner Pick\s*$/i.test(addon) ||
      (/^Boarding @/i.test(addon) && !/Club/i.test(addon)))
  ) {
    addon = mergeAddonLines(addon, lines[next]!);
    next++;
  }
  return { addon, next };
}

function isActivityFragment(line: string): boolean {
  if (/^activity\s*\|/i.test(line)) return true;
  const compact = line.replace(/\s+/g, " ").trim();
  if (/^foundations\s*&\s*$/i.test(compact)) return true;
  if (/^recall on the$/i.test(compact)) return true;
  return /^(adventure|hike|beach|excursion|cool|tricks|foundations|focus|recall|obedience|group|training|sport|on|the)$/i.test(
    compact
  );
}

function readActivity(lines: string[], start: number): { activity: string | null; next: number } {
  let next = start;
  const parts: string[] = [];
  if (next >= lines.length || !/^activity\s*\|/i.test(lines[next]!)) {
    return { activity: null, next };
  }
  while (next < lines.length) {
    const line = lines[next]!.trim();
    if (looksLikeServiceAddonLabel(line)) break;
    if (/^activity\s*\|/i.test(line)) {
      parts.push(line.replace(/^activity\s*\|\s*/i, "").trim());
      next++;
      continue;
    }
    if (!parts.length) break;
    if (!isActivityFragment(line)) break;
    parts.push(line);
    next++;
  }
  const activity = parts.join(" ").replace(/\s+/g, " ").trim();
  return { activity: activity || null, next };
}

function readDogAndOwner(lines: string[], start: number): { dogName: string; ownerName: string; next: number } | null {
  let next = start;
  const dogParts: string[] = [];
  while (next < lines.length && dogParts.length < 4) {
    const line = lines[next]!.trim();
    if (!line || isNoise(line) || looksLikeServiceAddonLabel(line) || /^activity\s*\|/i.test(line)) break;
    dogParts.push(line);
    next++;
    const combined = dogParts.join(" ");
    if (/\([^)]+\)/.test(combined)) break;
  }
  if (!dogParts.length) return null;
  const dogRaw = dogParts.join(" ").replace(/\s+/g, " ").trim();
  const dogName = dogRaw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!dogName) return null;

  const ownerParts: string[] = [];
  while (next < lines.length && ownerParts.length < 3) {
    const line = lines[next]!.trim();
    if (!line || isNoise(line) || looksLikeServiceAddonLabel(line)) break;
    if (
      /^(sports sign ups|overnight|cool tricks|group training|foundations|half day|full day)/i.test(line) ||
      /obedience|training|\|/i.test(line)
    ) {
      break;
    }
    ownerParts.push(line);
    next++;
  }
  const ownerName = ownerParts.join(" ").replace(/\s+/g, " ").trim();
  return { dogName, ownerName, next };
}

function readReservationType(lines: string[], start: number): { reservationType: string | null; next: number } {
  let next = start;
  const parts: string[] = [];
  while (next < lines.length && parts.length < 4) {
    const line = lines[next]!.trim();
    if (!line || isNoise(line)) {
      next++;
      continue;
    }
    if (looksLikeServiceAddonLabel(line)) break;
    if (
      /sign ups|group training|overnight|half day|full day|taxi|boarding|cool tricks|foundations|obedience|suite/i.test(
        line
      ) ||
      parts.length
    ) {
      parts.push(line);
      next++;
      if (/sign ups/i.test(line) || /group training/i.test(line) || /^overnight/i.test(line)) break;
      continue;
    }
    break;
  }
  const reservationType = parts.join(" ").replace(/\s+/g, " ").trim();
  return { reservationType: reservationType || null, next };
}

/** True when the extracted PDF text looks like Gingr's Service Addons report. */
export function isServiceAddonsReportText(text: string): boolean {
  const sample = text.slice(0, 4000).toLowerCase();
  return (
    sample.includes("service addons") &&
    (sample.includes("before outing") || sample.includes("after outing") || sample.includes("boarding @ fitdog club"))
  );
}

export function parseServiceAddonsReportText(text: string, routeDate: string): MappedUploadRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const rows: MappedUploadRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!looksLikeServiceAddonLabel(lines[i]!)) {
      i++;
      continue;
    }

    const { addon, next: afterAddon } = readAddon(lines, i);
    const { activity, next: afterActivity } = readActivity(lines, afterAddon);
    const dogOwner = readDogAndOwner(lines, afterActivity);
    if (!dogOwner) {
      i++;
      continue;
    }
    const { reservationType, next: afterType } = readReservationType(lines, dogOwner.next);
    const bookedType = reservationType || activity || "Sports Sign Ups";

    rows.push({
      dogName: dogOwner.dogName,
      ownerName: dogOwner.ownerName,
      ownerFirst: null,
      ownerLast: null,
      animalId: null,
      reservationId: null,
      reservationType: bookedType,
      services: activity ? [activity] : [bookedType],
      addons: [addon],
      address: null,
      street: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      notes: null,
      comments: null,
      pickupInstructions: null,
      dropoffInstructions: null,
      date: routeDate
    });

    i = Math.max(i + 1, afterType);
  }

  return mergeServiceAddonUploadRows(rows);
}

export function mergeServiceAddonUploadRows(rows: MappedUploadRow[]): MappedUploadRow[] {
  const merged = new Map<string, MappedUploadRow>();
  for (const row of rows) {
    const key = bookingMergeKey({
      dogName: row.dogName,
      ownerName: row.ownerName,
      reservationType: row.reservationType,
      date: row.date
    });
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...row,
        addons: row.addons.map((name) => normalizeServiceAddonLabel(name))
      });
      continue;
    }
    const addonSet = new Set([...existing.addons, ...row.addons].map((name) => normalizeServiceAddonLabel(name)));
    existing.addons = Array.from(addonSet);
    if (!existing.reservationType && row.reservationType) existing.reservationType = row.reservationType;
    if (!existing.services.length && row.services.length) existing.services = row.services;
  }
  return Array.from(merged.values());
}