/**
 * Admin-only Gingr route diagnostics: compare raw API payloads with RuffOps parsing.
 * Read-only — never writes to Gingr or Supabase.
 */

import { createGingrClient } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import {
  animalIdFromGingrReservation,
  animalNameFromGingrReservation,
  loadGingrReservationsForRouteDate
} from "@/lib/gingr-route-generator/gingr-reservation-load";
import { normalizeGingrRouteReservations } from "@/lib/gingr-route-generator/normalize";
import { RESERVATION_SERVICE_ARRAY_KEYS } from "@/lib/gingr-route-generator/reservation-service-rows";
import {
  collectReservationTransportCandidates,
  diagnoseReservationTransportPipeline
} from "@/lib/gingr-route-generator/transportation";

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function reservationIdOf(reservation: GingrReservation): string {
  return pickString(reservation.reservation_id, reservation.id) || "(no id)";
}

function matchesDogQuery(reservation: GingrReservation, dogQuery: string): boolean {
  const query = dogQuery.trim().toLowerCase();
  if (!query) return true;
  const name = animalNameFromGingrReservation(reservation)?.toLowerCase() || "";
  return name.includes(query);
}

function inventoryServiceArrays(reservation: Record<string, unknown>) {
  const inventory: Record<
    string,
    { length: number; kind: "array" | "string"; sampleLabels: string[]; sampleRowKeys: string[] }
  > = {};
  for (const key of RESERVATION_SERVICE_ARRAY_KEYS) {
    const value = reservation[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      const sampleLabels: string[] = [];
      const sampleRowKeys = new Set<string>();
      for (const item of value.slice(0, 8)) {
        if (typeof item === "string") sampleLabels.push(item.slice(0, 160));
        else if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = item as Record<string, unknown>;
          for (const rk of Object.keys(row).slice(0, 16)) sampleRowKeys.add(rk);
          sampleLabels.push(
            pickString(row.name, row.service, row.type, row.s_name, row.value, row.addon_name) || "(unnamed row)"
          );
        }
      }
      inventory[key] = {
        length: value.length,
        kind: "array",
        sampleLabels,
        sampleRowKeys: [...sampleRowKeys].sort()
      };
    } else if (typeof value === "string" && value.trim()) {
      inventory[key] = {
        length: 1,
        kind: "string",
        sampleLabels: [value.trim().slice(0, 220)],
        sampleRowKeys: []
      };
    }
  }
  return inventory;
}

const REDACTED = "[redacted]";
const SENSITIVE_KEY = /(?:^|_)(key|api_key|password|token|secret|ssn)(?:$|_)/i;
const PII_KEY = /(?:phone|cell|mobile|email|ssn)/i;

function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 14) return REDACTED;
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (PII_KEY.test(key) && typeof child === "string") {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactUnknown(child, depth + 1);
  }
  return out;
}

function summarizeReservation(reservation: GingrReservation, routeDate: string) {
  const record = reservation as Record<string, unknown>;
  const candidates = collectReservationTransportCandidates(record);
  const pipeline = diagnoseReservationTransportPipeline(record, routeDate);
  return {
    reservationId: reservationIdOf(reservation),
    animalId: animalIdFromGingrReservation(reservation),
    animalName: animalNameFromGingrReservation(reservation),
    type: pickString(record.type, record.reservation_type, record.r_type),
    startDate: pickString(record.start_date, record.scheduled_at)?.slice(0, 10) ?? null,
    topLevelKeys: Object.keys(record).sort(),
    serviceFieldInventory: inventoryServiceArrays(record),
    transportCandidateCount: candidates.length,
    transportCandidateTexts: candidates.map((c) => ({
      text: c.text,
      scheduledDate: c.scheduledDate,
      source: c.source
    })),
    pipeline,
    acceptedOptionCount: pipeline.filter((row) => row.accepted).length
  };
}

export type GingrRouteDiagnosticsReport = {
  ok: true;
  generatedAt: string;
  date: string;
  dogQuery: string;
  gingr: {
    configured: boolean;
    subdomain: string | null;
    locationId: string | null;
  };
  pulls: {
    primaryDateListCount: number;
    afterFullEnrichmentCount: number;
    matchedReservationCount: {
      primaryOnly: number;
      afterEnrichment: number;
    };
  };
  normalizedDog: {
    found: boolean;
    name: string | null;
    appointmentOptionCount: number;
    appointmentOptionLabels: string[];
    startLocation: string | null;
    endLocation: string | null;
    transportStatus: string | null;
    transportIssues: string[];
  } | null;
  reservations: {
    primaryDateList: ReturnType<typeof summarizeReservation>[];
    afterFullEnrichment: ReturnType<typeof summarizeReservation>[];
  };
  findings: {
    gingrConnectionWorking: boolean;
    gingrReturnsAddonDataOnPrimaryPull: boolean | null;
    gingrReturnsAddonDataAfterEnrichment: boolean | null;
    ruffopsParsesAddons: boolean | null;
    addonsFilteredByDateRules: boolean | null;
    addonFieldPathsObserved: string[];
    summary: string;
    recommendedNextStep: string;
  };
  rawReservationsAfterEnrichment?: unknown[];
};

function buildFindings(input: {
  configured: boolean;
  primary: ReturnType<typeof summarizeReservation>[];
  enriched: ReturnType<typeof summarizeReservation>[];
  normalizedDog: GingrRouteDiagnosticsReport["normalizedDog"];
}): GingrRouteDiagnosticsReport["findings"] {
  const primaryHas = input.primary.some((r) => r.transportCandidateCount > 0);
  const enrichedHas = input.enriched.some((r) => r.transportCandidateCount > 0);
  const parsedCount = input.normalizedDog?.appointmentOptionCount ?? 0;
  const filtered = input.enriched.some((r) =>
    r.pipeline.some((row) => row.classified && !row.accepted && row.appliesToRouteDate === false)
  );

  const paths = new Set<string>();
  for (const res of input.enriched) {
    for (const [field, meta] of Object.entries(res.serviceFieldInventory)) {
      if (meta.length > 0 && meta.sampleLabels.some((label) => /before|after|fitdog to|outing/i.test(label))) {
        paths.add(field);
      }
    }
  }

  let summary: string;
  let recommendedNextStep: string;

  if (!input.configured) {
    summary = "GINGR_API_KEY is not configured in this environment.";
    recommendedNextStep = "Set GINGR_API_KEY on Vercel, redeploy, and re-run diagnostics.";
  } else if (input.primary.length === 0 && input.enriched.length === 0) {
    summary = `No Gingr reservations matched dog query on the primary date list or after enrichment.`;
    recommendedNextStep = "Confirm the route date and dog name match Gingr (YYYY-MM-DD).";
  } else if (!primaryHas && !enrichedHas) {
    summary =
      "Gingr payloads for this dog on this date contain no recognizable Service Addon / transport text in any known field, even after owner/animal/detail enrichment pulls.";
    recommendedNextStep =
      "Compare includeRaw=1 payloads with the Gingr UI Services tab; if addons exist in UI but not in API JSON, open a Gingr support ticket about Partner API field coverage.";
  } else if (!primaryHas && enrichedHas) {
    summary =
      "Primary single-day reservation list omits addon rows; enriched pulls (date window, owner, animal, reservation id) surface them.";
    recommendedNextStep =
      "Ensure Refresh uses the enriched loader (already on main). If production still misses addons, capture which enrichment step added rows from the reservation ids diff.";
  } else if (enrichedHas && parsedCount === 0 && filtered) {
    summary =
      "Gingr sends transport addon text, but RuffOps date rules or classifiers reject every candidate for this route date.";
    recommendedNextStep = "Inspect pipeline[].skipReason and scheduledDate vs routeDate; adjust optionAppliesToRouteDate only for confirmed shapes.";
  } else if (enrichedHas && parsedCount === 0) {
    summary = "Gingr sends transport-like strings, but classifyAppointmentOption does not recognize the label format.";
    recommendedNextStep = "Add a classifier mapping for the exact optionName strings shown in pipeline[].text.";
  } else if (parsedCount > 0) {
    summary = "Gingr addon data is present and RuffOps normalized at least one appointment option for this dog.";
    recommendedNextStep =
      "If Starts/Ends still look wrong, inspect address / transport plan (separate from addon discovery).";
  } else {
    summary = "Inconclusive — inspect per-reservation inventory and pipeline arrays.";
    recommendedNextStep = "Re-run with includeRaw=1 and share findings with engineering.";
  }

  return {
    gingrConnectionWorking: input.configured,
    gingrReturnsAddonDataOnPrimaryPull: input.primary.length ? primaryHas : null,
    gingrReturnsAddonDataAfterEnrichment: input.enriched.length ? enrichedHas : null,
    ruffopsParsesAddons: input.enriched.length ? parsedCount > 0 : null,
    addonsFilteredByDateRules: input.enriched.length ? filtered && parsedCount === 0 : null,
    addonFieldPathsObserved: [...paths].sort(),
    summary,
    recommendedNextStep
  };
}

export async function buildGingrRouteDiagnostics(options: {
  date: string;
  dogQuery?: string;
  includeRaw?: boolean;
}): Promise<GingrRouteDiagnosticsReport> {
  const date = options.date;
  const dogQuery = (options.dogQuery || "Annie").trim();
  const client = createGingrClient();
  const configured = Boolean(client.config.apiKey);

  const primaryDateList = configured
    ? (await client.listReservationsByDate(date)).filter((r) => matchesDogQuery(r, dogQuery))
    : [];
  const allEnriched = configured ? await loadGingrReservationsForRouteDate(client, date) : [];
  const fullEnrichment = allEnriched.filter((r) => matchesDogQuery(r, dogQuery));

  const normalized = configured
    ? normalizeGingrRouteReservations(allEnriched, date)
  : { dogs: [] as ReturnType<typeof normalizeGingrRouteReservations>["dogs"] };

  const query = dogQuery.toLowerCase();
  const dog = normalized.dogs.find((d) => d.name.toLowerCase().includes(query)) ?? null;

  const primarySummaries = primaryDateList.map((r) => summarizeReservation(r, date));
  const enrichedSummaries = fullEnrichment.map((r) => summarizeReservation(r, date));

  const report: GingrRouteDiagnosticsReport = {
    ok: true,
    generatedAt: new Date().toISOString(),
    date,
    dogQuery,
    gingr: {
      configured,
      subdomain: client.config.subdomain || null,
      locationId: client.config.locationId || null
    },
    pulls: {
      primaryDateListCount: primaryDateList.length,
      afterFullEnrichmentCount: fullEnrichment.length,
      matchedReservationCount: {
        primaryOnly: primarySummaries.length,
        afterEnrichment: enrichedSummaries.length
      }
    },
    normalizedDog: dog
      ? {
          found: true,
          name: dog.name,
          appointmentOptionCount: dog.appointmentOptions.length,
          appointmentOptionLabels: [...dog.appointmentOptions],
          startLocation: dog.startLocation,
          endLocation: dog.endLocation,
          transportStatus: dog.transportPlan.status,
          transportIssues: dog.transportPlan.issues
        }
      : dogQuery
        ? {
            found: false,
            name: null,
            appointmentOptionCount: 0,
            appointmentOptionLabels: [],
            startLocation: null,
            endLocation: null,
            transportStatus: "NEEDS_REVIEW",
            transportIssues: ["No normalized route dog matched the query."]
          }
        : null,
    reservations: {
      primaryDateList: primarySummaries,
      afterFullEnrichment: enrichedSummaries
    },
    findings: buildFindings({
      configured,
      primary: primarySummaries,
      enriched: enrichedSummaries,
      normalizedDog: dog
        ? {
            found: true,
            name: dog.name,
            appointmentOptionCount: dog.appointmentOptions.length,
            appointmentOptionLabels: [...dog.appointmentOptions],
            startLocation: dog.startLocation,
            endLocation: dog.endLocation,
            transportStatus: dog.transportPlan.status,
            transportIssues: dog.transportPlan.issues
          }
        : null
    })
  };

  if (options.includeRaw) {
    report.rawReservationsAfterEnrichment = fullEnrichment.map((r) => redactUnknown(r));
  }

  return report;
}