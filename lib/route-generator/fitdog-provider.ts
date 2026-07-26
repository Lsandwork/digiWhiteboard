import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  autoMapHeaders,
  looksLikeLoginPage,
  normalizeReportRows,
  parseCsv,
  type FieldMapping,
  type NormalizedReportItem
} from "@/lib/route-generator/parser";
import { isFitdogReportSyncEnabled } from "@/lib/route-generator/flags";
import { canUseFitdogEmployeeApi, pullFitdogRouteReportFromApi } from "@/lib/route-generator/fitdog-api";

export type FitdogPullResult = {
  sourceMode: "fixture" | "api" | "csv" | "browser_worker";
  pickupCsv: string;
  dropoffCsv: string;
  pickupItems: NormalizedReportItem[];
  dropoffItems: NormalizedReportItem[];
  pickupMapping: FieldMapping;
  dropoffMapping: FieldMapping;
  formatChanged: boolean;
  warnings: string[];
};

async function loadFixture(name: string) {
  const full = path.join(process.cwd(), "scripts/fixtures/route-generator", name);
  return readFile(full, "utf8");
}

function resolveSourceMode(explicit?: FitdogPullResult["sourceMode"]): FitdogPullResult["sourceMode"] {
  if (explicit) return explicit;
  // Prefer live Fitdog API whenever employee OAuth credentials are configured.
  if (canUseFitdogEmployeeApi() || isFitdogReportSyncEnabled()) return "api";
  return "fixture";
}

async function pullFromFixtures(params: {
  fieldMapping?: FieldMapping;
  warnings: string[];
}): Promise<FitdogPullResult> {
  const pickupCsv = await loadFixture("pickup-sample.csv");
  const dropoffCsv = await loadFixture("dropoff-sample.csv");

  if (looksLikeLoginPage(pickupCsv) || looksLikeLoginPage(dropoffCsv)) {
    throw new Error("Your Fitdog session expired. A Super Admin must reconnect the integration.");
  }

  const pickupParsed = parseCsv(pickupCsv);
  const dropoffParsed = parseCsv(dropoffCsv);
  const pickupMapping = params.fieldMapping ?? autoMapHeaders(pickupParsed.headers);
  const dropoffMapping = params.fieldMapping ?? autoMapHeaders(dropoffParsed.headers);

  const pickupNorm = normalizeReportRows({
    rows: pickupParsed.rows,
    mapping: pickupMapping,
    defaultDirection: "pickup"
  });
  const dropoffNorm = normalizeReportRows({
    rows: dropoffParsed.rows,
    mapping: dropoffMapping,
    defaultDirection: "dropoff"
  });

  if (pickupNorm.formatChanged || dropoffNorm.formatChanged) {
    params.warnings.push("Report format changed — management review required.");
  }

  return {
    sourceMode: "fixture",
    pickupCsv,
    dropoffCsv,
    pickupItems: pickupNorm.items,
    dropoffItems: dropoffNorm.items,
    pickupMapping,
    dropoffMapping,
    formatChanged: pickupNorm.formatChanged || dropoffNorm.formatChanged,
    warnings: params.warnings
  };
}

/**
 * Modular Fitdog report provider.
 * Priority: authorized API (class occurrences + products) → fixtures (dev only).
 */
export class FitdogRouteReportProvider {
  async pullForDate(params: {
    date: string;
    sourceMode?: "fixture" | "api" | "csv" | "browser_worker";
    fieldMapping?: FieldMapping;
  }): Promise<FitdogPullResult> {
    const warnings: string[] = [];
    const mode = resolveSourceMode(params.sourceMode);

    if (mode === "fixture") {
      warnings.push("Using sanitized fixture dogs (demo). Configure Fitdog employee credentials for live pulls.");
      return pullFromFixtures({ fieldMapping: params.fieldMapping, warnings });
    }

    if (mode === "csv" || mode === "browser_worker") {
      throw new Error(
        `Fitdog source mode "${mode}" is not enabled. Live pulls use the Fitdog employee API (class occurrences).`
      );
    }

    // mode === "api"
    if (!canUseFitdogEmployeeApi()) {
      throw new Error(
        "Live Fitdog pull requires FITDOG_EMPLOYEE_EMAIL and FITDOG_EMPLOYEE_PASSWORD (same credentials as Fitdog Alerts)."
      );
    }

    const live = await pullFitdogRouteReportFromApi(params.date);
    warnings.push(...live.warnings);
    warnings.push(
      `Live Fitdog API pull: ${live.productCount} scheduled dog(s) across ${live.services.join(", ") || "no route services"} (${live.occurrenceCount} occurrence(s)).`
    );

    const pickupMapping: FieldMapping = {
      reservation_id: "Reservation ID",
      customer_id: "Customer ID",
      owner_full_name: "Owner Name",
      dog_id: "Dog ID",
      dog_name: "Dog Name",
      service_name: "Service",
      pickup_address: "Pickup Address",
      city: "City",
      state: "State",
      zip: "ZIP",
      owner_phone: "Phone",
      pickup_window_start: "Pickup Window Start",
      pickup_window_end: "Pickup Window End",
      dog_size: "Dog Size",
      driver_notes: "Driver Notes"
    };
    const dropoffMapping: FieldMapping = {
      ...pickupMapping,
      pickup_address: undefined,
      dropoff_address: "Dropoff Address",
      pickup_window_start: undefined,
      pickup_window_end: undefined,
      dropoff_window_start: "Dropoff Window Start",
      dropoff_window_end: "Dropoff Window End"
    };

    return {
      sourceMode: "api",
      pickupCsv: live.pickupCsv,
      dropoffCsv: live.dropoffCsv,
      pickupItems: live.pickupItems,
      dropoffItems: live.dropoffItems,
      pickupMapping,
      dropoffMapping,
      formatChanged: false,
      warnings
    };
  }
}

export const fitdogRouteReportProvider = new FitdogRouteReportProvider();
