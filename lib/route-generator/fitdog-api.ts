import {
  fetchFitdogEmployeeAccessToken,
  FITDOG_API_HOST
} from "@/lib/fitdog-ops/providers/fitdog-oauth";
import { fitdogEmployeeEmail, fitdogEmployeePassword } from "@/lib/fitdog-ops/config";
import { maskPhone, type NormalizedReportItem, type RawReportRow } from "@/lib/route-generator/parser";
import { normalizeServiceName } from "@/lib/route-generator/services";
import { householdKey, parseAddress } from "@/lib/route-generator/address";
import type { CanonicalService } from "@/lib/route-generator/flags";
import type { DogSize } from "@/lib/route-generator/capacity";

type FitdogAddress = {
  id?: number;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  location_notes?: string | null;
  name?: string | null;
};

type FitdogDog = {
  id?: number;
  name?: string | null;
  weight?: number | null;
  weight_detail?: string | null;
};

type FitdogOwner = {
  id?: number;
  full_name?: string | null;
  email?: string | null;
  primary_phone?: { phone_number?: string | null } | number | null;
};

type FitdogOccurrence = {
  id: number;
  date: string;
  training_class?: number;
  pickup_start_time?: string | null;
  pickup_end_time?: string | null;
  dropoff_start_time?: string | null;
  dropoff_end_time?: string | null;
  training_class_detail?: {
    id?: number;
    name?: string | null;
  } | null;
  status?: number;
  status_detail?: string | null;
};

type FitdogProduct = {
  id: number;
  status?: number;
  status_detail?: string | null;
  dog?: number | null;
  dog_detail?: FitdogDog | null;
  owner?: number | null;
  owner_detail?: FitdogOwner | null;
  customer?: number | null;
  customer_detail?: FitdogOwner | null;
  pickup_location?: number | null;
  pickup_location_detail?: FitdogAddress | null;
  drop_off_location?: number | null;
  drop_off_location_detail?: FitdogAddress | null;
  is_default_pickup?: boolean;
  is_default_dropoff?: boolean;
  notes?: string | null;
  reports?: unknown[];
  class_occurrence?: number;
  class_occurrence_detail?: FitdogOccurrence | null;
};

const WEIGHT_TO_SIZE: Record<number, DogSize> = {
  0: "Small", // 0-10 lbs
  1: "Small", // 10-20
  2: "Medium", // 20-30
  3: "Medium", // 30-40
  4: "Large", // 40-50
  5: "Large", // 50-60
  6: "Extra Large", // 60-70
  7: "Extra Large", // 70-85
  8: "Extra Large" // 85+
};

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  return text;
}

function formatTime(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  // "07:00:00" -> "07:00"
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function addressFromDetail(detail: FitdogAddress | null | undefined): {
  raw: string | null;
  street: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
} {
  const street = cleanText(detail?.address1);
  const unit = cleanText(detail?.address2);
  const city = cleanText(detail?.city);
  const state = cleanText(detail?.state);
  const zip = cleanText(detail?.zip_code);
  const notes = cleanText(detail?.location_notes);
  const raw = [street, unit, city, state, zip].filter(Boolean).join(", ") || null;
  return { raw, street, unit, city, state, zip, notes };
}

function ownerPhone(owner: FitdogOwner | null | undefined): string | null {
  const phone = owner?.primary_phone;
  if (phone && typeof phone === "object") return cleanText(phone.phone_number);
  return null;
}

function dogSizeFromWeight(weight: number | null | undefined): DogSize | null {
  if (weight == null || Number.isNaN(Number(weight))) return null;
  return WEIGHT_TO_SIZE[Number(weight)] ?? "Unknown";
}

function splitOwnerName(fullName: string | null): { first: string | null; last: string | null } {
  if (!fullName) return { first: null, last: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function isScheduledProduct(product: FitdogProduct): boolean {
  if (product.status === 0) return true;
  const detail = String(product.status_detail || "").toLowerCase();
  return detail === "scheduled" || detail === "active";
}

async function fitdogGetJson<T>(token: string, path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${FITDOG_API_HOST}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      Referer: "https://app.fitdog.com/",
      Origin: "https://app.fitdog.com",
      "User-Agent": "staff.ruffops.com-route-generator/1.0"
    },
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Fitdog API ${path} failed (${response.status}).`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Fitdog API ${path} returned non-JSON.`);
  }
}

async function fetchOccurrencesForDate(token: string, date: string): Promise<FitdogOccurrence[]> {
  const pageSize = 100;
  let path: string | null =
    `/api/v1/employees/class-occurrences/?date__gte=${encodeURIComponent(date)}&date__lte=${encodeURIComponent(date)}&page_size=${pageSize}`;
  const out: FitdogOccurrence[] = [];
  while (path) {
    const page: { results?: FitdogOccurrence[]; next?: string | null } = await fitdogGetJson(token, path);
    for (const row of page.results || []) {
      if (row.date === date) out.push(row);
    }
    path = page.next || null;
  }
  return out;
}

async function fetchProductsForOccurrence(token: string, occurrenceId: number): Promise<FitdogProduct[]> {
  const data = await fitdogGetJson<FitdogProduct[] | { results?: FitdogProduct[] }>(
    token,
    `/api/v1/employees/class-occurrences/${occurrenceId}/products/`
  );
  return Array.isArray(data) ? data : data.results || [];
}

function buildItem(params: {
  direction: "pickup" | "dropoff";
  product: FitdogProduct;
  occurrence: FitdogOccurrence;
  serviceRaw: string;
  serviceCanonical: CanonicalService;
}): NormalizedReportItem {
  const { direction, product, occurrence, serviceRaw, serviceCanonical } = params;
  const owner = product.owner_detail || product.customer_detail || null;
  const ownerFullName = cleanText(owner?.full_name);
  const { first: ownerFirstName, last: ownerLastName } = splitOwnerName(ownerFullName);
  const dogName = cleanText(product.dog_detail?.name);
  const dogId = product.dog != null ? String(product.dog) : product.dog_detail?.id != null ? String(product.dog_detail.id) : null;
  const customerId =
    product.owner != null
      ? String(product.owner)
      : product.customer != null
        ? String(product.customer)
        : owner?.id != null
          ? String(owner.id)
          : null;

  const address =
    direction === "pickup"
      ? addressFromDetail(product.pickup_location_detail)
      : addressFromDetail(product.drop_off_location_detail);

  const parsed = parseAddress(
    address.raw ||
      [address.street, address.unit, address.city, address.state, address.zip].filter(Boolean).join(", ")
  );
  if (!parsed.street && address.street) parsed.street = address.street;
  if (!parsed.unit && address.unit) parsed.unit = address.unit;
  if (!parsed.city && address.city) parsed.city = address.city;
  if (!parsed.state && address.state) parsed.state = address.state;
  if (!parsed.zip && address.zip) parsed.zip = address.zip;

  const dogSize = dogSizeFromWeight(product.dog_detail?.weight);
  const phone = ownerPhone(owner);
  const windowStart =
    direction === "pickup"
      ? formatTime(occurrence.pickup_start_time)
      : formatTime(occurrence.dropoff_start_time);
  const windowEnd =
    direction === "pickup"
      ? formatTime(occurrence.pickup_end_time)
      : formatTime(occurrence.dropoff_end_time);

  const reasons: string[] = [];
  if (!address.raw) reasons.push("Missing address");
  if (!dogName) reasons.push("Missing dog name");
  if (!dogSize) reasons.push("Missing dog size");

  const validationStatus = reasons.some((r) => /missing address/i.test(r))
    ? "error"
    : reasons.length
      ? "warning"
      : "ok";

  const locationDetail =
    direction === "pickup" ? product.pickup_location_detail : product.drop_off_location_detail;
  const raw: RawReportRow = {
    reservation_id: String(product.id),
    customer_id: customerId || "",
    owner_full_name: ownerFullName || "",
    dog_id: dogId || "",
    dog_name: dogName || "",
    service: serviceRaw,
    direction,
    address: address.raw || "",
    city: address.city || "",
    state: address.state || "",
    zip: address.zip || "",
    phone: phone || "",
    dog_size: dogSize || "",
    weight: product.dog_detail?.weight != null ? String(product.dog_detail.weight) : "",
    location_notes: address.notes || "",
    location_name: cleanText(locationDetail?.name) || "",
    occurrence_id: String(occurrence.id),
    class_id: String(occurrence.training_class ?? occurrence.training_class_detail?.id ?? ""),
    status: String(product.status_detail ?? product.status ?? "")
  };

  return {
    direction,
    reservationId: String(product.id),
    customerId,
    ownerFirstName,
    ownerLastName,
    ownerFullName,
    dogId,
    dogName,
    serviceRaw,
    serviceCanonical,
    addressRaw: address.raw,
    addressStreet: address.street || parsed.street || null,
    addressUnit: address.unit || parsed.unit || null,
    addressCity: address.city || parsed.city || null,
    addressState: address.state || parsed.state || null,
    addressZip: address.zip || parsed.zip || null,
    ownerPhoneMasked: maskPhone(phone),
    timeWindowStart: windowStart,
    timeWindowEnd: windowEnd,
    dogSize: dogSize || null,
    specialNotes: address.notes,
    driverNotes: address.notes,
    reservationNotes: cleanText(product.notes),
    householdKey: address.raw ? householdKey(parsed) : null,
    validationStatus,
    validationReasons: reasons,
    raw
  };
}

function csvEscape(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function itemsToCsv(items: NormalizedReportItem[], direction: "pickup" | "dropoff"): string {
  const headers = [
    "Reservation ID",
    "Customer ID",
    "Owner Name",
    "Dog ID",
    "Dog Name",
    "Service",
    direction === "pickup" ? "Pickup Address" : "Dropoff Address",
    "City",
    "State",
    "ZIP",
    "Phone",
    direction === "pickup" ? "Pickup Window Start" : "Dropoff Window Start",
    direction === "pickup" ? "Pickup Window End" : "Dropoff Window End",
    "Dog Size",
    "Driver Notes"
  ];
  const lines = [headers.join(",")];
  for (const item of items) {
    lines.push(
      [
        item.reservationId,
        item.customerId,
        item.ownerFullName,
        item.dogId,
        item.dogName,
        item.serviceRaw,
        item.addressRaw,
        item.addressCity,
        item.addressState,
        item.addressZip,
        item.ownerPhoneMasked,
        item.timeWindowStart,
        item.timeWindowEnd,
        item.dogSize,
        item.driverNotes
      ]
        .map((v) => csvEscape(v))
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function canUseFitdogEmployeeApi(): boolean {
  return Boolean(fitdogEmployeeEmail() && fitdogEmployeePassword());
}

export type SkippedOccurrenceDog = {
  productId: number;
  dogId: string | null;
  dogName: string | null;
  ownerName: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  status: string | null;
};

export type SkippedOccurrence = {
  occurrenceId: number;
  date: string;
  classId: number | null;
  className: string;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  dropoffWindowStart: string | null;
  dropoffWindowEnd: string | null;
  dogCount: number;
  dogs: SkippedOccurrenceDog[];
  assignedVanKey?: string | null;
  assignedService?: CanonicalService | null;
  assignedAt?: string | null;
};

export type FitdogApiPullBundle = {
  pickupItems: NormalizedReportItem[];
  dropoffItems: NormalizedReportItem[];
  pickupCsv: string;
  dropoffCsv: string;
  warnings: string[];
  skippedOccurrences: SkippedOccurrence[];
  occurrenceCount: number;
  productCount: number;
  services: string[];
};

function summarizeProductDog(product: FitdogProduct): SkippedOccurrenceDog {
  return {
    productId: product.id,
    dogId: product.dog != null ? String(product.dog) : product.dog_detail?.id != null ? String(product.dog_detail.id) : null,
    dogName: cleanText(product.dog_detail?.name),
    ownerName: cleanText(product.owner_detail?.full_name || product.customer_detail?.full_name),
    pickupAddress: addressFromDetail(product.pickup_location_detail).raw,
    dropoffAddress: addressFromDetail(product.drop_off_location_detail).raw,
    status: cleanText(product.status_detail) || (product.status != null ? String(product.status) : null)
  };
}

/** Map a van choice to the canonical outing service used when promoting a skipped class. */
export function serviceForAssignedVan(vanKey: string): CanonicalService {
  if (vanKey === "van_3") return "Beach Excursion";
  if (vanKey === "van_1" || vanKey === "van_2") return "Adventure Hike";
  return "Adventure Hike";
}

/**
 * Re-fetch a Fitdog class occurrence and build pickup/drop-off report items for a chosen van/service.
 */
export async function promoteSkippedOccurrenceToItems(params: {
  occurrenceId: number;
  vanKey: string;
  serviceCanonical?: CanonicalService;
}): Promise<{ items: NormalizedReportItem[]; occurrence: FitdogOccurrence; className: string }> {
  const token = await fetchFitdogEmployeeAccessToken();
  const occurrence = await fitdogGetJson<FitdogOccurrence>(
    token.access_token,
    `/api/v1/employees/class-occurrences/${params.occurrenceId}/`
  );
  const className = cleanText(occurrence.training_class_detail?.name) || `Class ${params.occurrenceId}`;
  const serviceCanonical = params.serviceCanonical || serviceForAssignedVan(params.vanKey);
  const products = await fetchProductsForOccurrence(token.access_token, params.occurrenceId);
  const items: NormalizedReportItem[] = [];
  for (const product of products) {
    if (!isScheduledProduct(product)) continue;
    for (const direction of ["pickup", "dropoff"] as const) {
      const item = buildItem({
        direction,
        product,
        occurrence,
        serviceRaw: className,
        serviceCanonical
      });
      item.raw = {
        ...item.raw,
        locked_van: params.vanKey,
        assigned_from_skipped: "true",
        original_class_name: className,
        occurrence_id: String(params.occurrenceId)
      };
      items.push(item);
    }
  }
  return { items, occurrence, className };
}

/**
 * Pull live Fitdog class signups for an operating date via OAuth + class-occurrences/products.
 * Includes Beach Excursion, Adventure Hike(s), Trainer-Led Hike, Group Class, and Taxi when present.
 */
export async function pullFitdogRouteReportFromApi(date: string): Promise<FitdogApiPullBundle> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Operating date must be YYYY-MM-DD.");
  }
  if (!canUseFitdogEmployeeApi()) {
    throw new Error("Fitdog employee credentials are not configured (FITDOG_EMPLOYEE_EMAIL / FITDOG_EMPLOYEE_PASSWORD).");
  }

  const token = await fetchFitdogEmployeeAccessToken();
  const occurrences = await fetchOccurrencesForDate(token.access_token, date);
  const warnings: string[] = [];
  const skippedOccurrences: SkippedOccurrence[] = [];
  const pickupItems: NormalizedReportItem[] = [];
  const dropoffItems: NormalizedReportItem[] = [];
  const services = new Set<string>();
  let productCount = 0;
  let skippedUnscheduled = 0;

  for (const occurrence of occurrences) {
    const serviceRaw = cleanText(occurrence.training_class_detail?.name);
    if (!serviceRaw) continue;
    const serviceCanonical = normalizeServiceName(serviceRaw);
    const products = await fetchProductsForOccurrence(token.access_token, occurrence.id);

    if (!serviceCanonical) {
      const scheduled = products.filter((product) => isScheduledProduct(product));
      skippedOccurrences.push({
        occurrenceId: occurrence.id,
        date: occurrence.date,
        classId: occurrence.training_class ?? occurrence.training_class_detail?.id ?? null,
        className: serviceRaw,
        pickupWindowStart: formatTime(occurrence.pickup_start_time),
        pickupWindowEnd: formatTime(occurrence.pickup_end_time),
        dropoffWindowStart: formatTime(occurrence.dropoff_start_time),
        dropoffWindowEnd: formatTime(occurrence.dropoff_end_time),
        dogCount: scheduled.length,
        dogs: scheduled.map(summarizeProductDog)
      });
      continue;
    }
    services.add(serviceRaw);

    for (const product of products) {
      if (!isScheduledProduct(product)) {
        skippedUnscheduled += 1;
        continue;
      }
      productCount += 1;
      pickupItems.push(
        buildItem({
          direction: "pickup",
          product,
          occurrence,
          serviceRaw,
          serviceCanonical
        })
      );
      dropoffItems.push(
        buildItem({
          direction: "dropoff",
          product,
          occurrence,
          serviceRaw,
          serviceCanonical
        })
      );
    }
  }

  if (!occurrences.length) {
    warnings.push(`No Fitdog class occurrences found for ${date}.`);
  } else if (!productCount) {
    warnings.push(
      `Fitdog returned ${occurrences.length} occurrence(s) for ${date}, but no scheduled dogs for route services (Beach Excursion, Adventure Hike, Trainer-Led Hike, Group Class, Taxi).`
    );
  }
  if (skippedOccurrences.length) {
    warnings.push(
      `Skipped ${skippedOccurrences.length} non-route class occurrence(s) (not Beach/Adventure/Trainer/Group/Taxi).`
    );
  }
  if (skippedUnscheduled) {
    warnings.push(`Skipped ${skippedUnscheduled} cancelled/unscheduled product(s).`);
  }

  return {
    pickupItems,
    dropoffItems,
    pickupCsv: itemsToCsv(pickupItems, "pickup"),
    dropoffCsv: itemsToCsv(dropoffItems, "dropoff"),
    warnings,
    skippedOccurrences,
    occurrenceCount: occurrences.length,
    productCount,
    services: [...services].sort()
  };
}
