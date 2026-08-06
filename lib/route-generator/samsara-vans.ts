/**
 * Canonical Fitdog ↔ Samsara van identity (synced from live API 2026-07-27).
 * Display names stay "Van 1"; Samsara names are zero-padded ("Van 01").
 * Never include Van 4 / Club Van / "Ignore this".
 */
export type FitdogSamsaraVan = {
  vanKey: "van_1" | "van_2" | "van_3" | "van_5" | "van_6";
  displayName: string;
  /** Exact name in cloud.samsara.com (must match for CSV assign + GPS). */
  samsaraVehicleName: string;
  /** Samsara vehicle id from fleet/vehicles. */
  samsaraVehicleId: string | null;
  /** Vehicle Gateway serial (API returns without dashes; we accept either). */
  samsaraSerial: string | null;
  vin: string | null;
  licensePlate: string | null;
  makeModel: string | null;
};

/**
 * Live Fitdog fleet (api.samsara.com) — excludes Van 04, Club Van, Ignore this.
 */
export const FITDOG_SAMSARA_VANS: readonly FitdogSamsaraVan[] = [
  {
    vanKey: "van_1",
    displayName: "Van 1",
    samsaraVehicleName: "Van 01",
    samsaraVehicleId: "212014918476770",
    samsaraSerial: "GXPDPPWGEV",
    vin: "NM0LS7E72J1372132",
    licensePlate: "38459L2",
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_2",
    displayName: "Van 2",
    samsaraVehicleName: "Van 02",
    samsaraVehicleId: "212014918476840",
    samsaraSerial: "GW6EADZATK",
    vin: "NM0LS7E74J1371466",
    licensePlate: "38516L2",
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_3",
    displayName: "Van 3",
    samsaraVehicleName: "Van 03",
    samsaraVehicleId: "212014918476677",
    samsaraSerial: "GVE5PCJ7KK",
    vin: "NM0LS7E75J1372142",
    licensePlate: "38460L2",
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_5",
    displayName: "Van 5",
    samsaraVehicleName: "Van 05",
    samsaraVehicleId: "281474979484360",
    samsaraSerial: "GGR6JKWB6F",
    vin: "3N6CM0KN6JK701997",
    licensePlate: "69357N2",
    makeModel: "2018 NISSAN NV200"
  },
  {
    vanKey: "van_6",
    displayName: "Van 6",
    samsaraVehicleName: "Van 06",
    samsaraVehicleId: "281474985101241",
    samsaraSerial: "GKEWDZK4NX",
    vin: "3N6CM0KN3MK705283",
    licensePlate: null,
    makeModel: "2021 NISSAN NV200"
  }
] as const;

export function getFitdogSamsaraVan(vanKey: string): FitdogSamsaraVan | undefined {
  return FITDOG_SAMSARA_VANS.find((v) => v.vanKey === vanKey);
}

/** Normalize gateway serials so GXPD-PPW-GEV === GXPDPPWGEV. */
export function normalizeSamsaraSerial(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
