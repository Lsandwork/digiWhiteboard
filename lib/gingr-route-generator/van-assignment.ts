/**
 * Gingr "Assigned To" on the Services By Date report drives van pools:
 * Van 1 / 2 / 3 = outing vans. Ivonne / Amanda + taxi dogs share the club van (Van 5).
 */

import { gingrTimestampDateKey } from "@/lib/gingr-route-generator/transportation";
import type { GingrRouteActivityId } from "@/lib/gingr-route-generator/activities";
import { GINGR_ROUTE_ACTIVITY_BY_ID } from "@/lib/gingr-route-generator/activities";

export type GingrRouteVanKey = "van_1" | "van_2" | "van_3" | "van_5";

const CLUB_TRAINER_RE = /\b(ivonne|amanda)\b/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeAssignee(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGingrAssignedVan(raw: unknown): GingrRouteVanKey | null {
  const token = normalizeAssignee(raw);
  if (!token) return null;
  if (/\bvan\s*0*1\b/.test(token) || token === "1") return "van_1";
  if (/\bvan\s*0*2\b/.test(token) || token === "2") return "van_2";
  if (/\bvan\s*0*3\b/.test(token) || token === "3") return "van_3";
  if (/\bvan\s*0*5\b/.test(token) || /\bvan\s*0*6\b/.test(token)) return "van_5";
  if (CLUB_TRAINER_RE.test(token)) return "van_5";
  return null;
}

export function isClubTrainerAssignee(raw: unknown): boolean {
  return CLUB_TRAINER_RE.test(normalizeAssignee(raw));
}

export function samsaraVehicleNameForVan(vanKey: GingrRouteVanKey): string {
  if (vanKey === "van_5") return "Van 05";
  if (vanKey === "van_2") return "Van 02";
  if (vanKey === "van_3") return "Van 03";
  return "Van 01";
}

export function vanKeyFromExportVehicle(vehicleName: string | null | undefined): GingrRouteVanKey | "all" {
  const token = normalizeAssignee(vehicleName);
  if (!token || token === "all" || token === "all vans") return "all";
  return parseGingrAssignedVan(token) ?? "all";
}

function serviceRows(reservation: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const key of ["services", "service_items", "addons", "items"]) {
    const value = reservation[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const record = asRecord(item);
      if (record) rows.push(record);
    }
  }
  return rows;
}

function assigneeFromRecord(record: Record<string, unknown>): string | null {
  const raw =
    record.assigned_to ??
    record.assignedTo ??
    record.assigned_user ??
    record.assigned_staff ??
    record.staff ??
    record.employee;
  const text = String(raw ?? "").trim();
  return text || null;
}

/** Labels from the reservation and same-day services (Gingr Assigned To). */
export function collectAssignedToLabels(
  reservation: Record<string, unknown>,
  routeDate: string
): string[] {
  const labels: string[] = [];
  const top = assigneeFromRecord(reservation);
  if (top) labels.push(top);

  for (const row of serviceRows(reservation)) {
    const scheduled =
      gingrTimestampDateKey(row.scheduled_at) || gingrTimestampDateKey(row.scheduled_until);
    if (scheduled && scheduled !== routeDate) continue;
    const label = assigneeFromRecord(row);
    if (label) labels.push(label);
  }
  return labels;
}

export function resolveRouteVanKey(params: {
  assignedLabels: string[];
  isTaxi: boolean;
  activities: GingrRouteActivityId[];
}): GingrRouteVanKey {
  if (params.isTaxi) return "van_5";

  const parsed = params.assignedLabels
    .map((label) => parseGingrAssignedVan(label))
    .filter((key): key is GingrRouteVanKey => Boolean(key));
  const outing = parsed.find((key) => key === "van_1" || key === "van_2" || key === "van_3");
  if (outing) return outing;
  if (parsed[0]) return parsed[0];

  const hasOuting = params.activities.some(
    (id) => GINGR_ROUTE_ACTIVITY_BY_ID[id]?.category === "outing"
  );
  return hasOuting ? "van_1" : "van_5";
}

export function ownerLastNameFromDisplay(owner: string | null | undefined): string | null {
  const parts = String(owner ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts[0] || null;
  return parts[parts.length - 1] || null;
}

export function clubPassengerNote(dogName: string, ownerLastName: string | null | undefined): string {
  const last = String(ownerLastName || "").trim();
  const name = String(dogName || "").trim();
  return [name, last].filter(Boolean).join(" ");
}
