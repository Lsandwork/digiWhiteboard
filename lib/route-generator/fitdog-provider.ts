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

/**
 * Modular Fitdog report provider.
 * Priority: authorized API → CSV export → browser worker → fixtures (dev/shadow).
 */
export class FitdogRouteReportProvider {
  async pullForDate(params: {
    date: string;
    sourceMode?: "fixture" | "api" | "csv" | "browser_worker";
    fieldMapping?: FieldMapping;
  }): Promise<FitdogPullResult> {
    const warnings: string[] = [];
    const mode = params.sourceMode ?? (isFitdogReportSyncEnabled() ? "api" : "fixture");

    if (mode !== "fixture") {
      // Live connectors require encrypted secrets + worker; fail safely until configured.
      warnings.push(
        "Live Fitdog report sync is not production-verified in this environment. Using sanitized fixtures until a Super Admin completes Connect Fitdog."
      );
    }

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
      warnings.push("Report format changed — management review required.");
    }

    return {
      sourceMode: mode === "fixture" ? "fixture" : "fixture",
      pickupCsv,
      dropoffCsv,
      pickupItems: pickupNorm.items,
      dropoffItems: dropoffNorm.items,
      pickupMapping,
      dropoffMapping,
      formatChanged: pickupNorm.formatChanged || dropoffNorm.formatChanged,
      warnings
    };
  }
}

export const fitdogRouteReportProvider = new FitdogRouteReportProvider();
