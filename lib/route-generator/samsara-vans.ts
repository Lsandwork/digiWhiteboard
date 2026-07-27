/**
 * Canonical Fitdog ↔ Samsara van identity.
 * Display names stay "Van 1"; Samsara names are zero-padded ("Van 01").
 * Never include Van 4.
 */
export type FitdogSamsaraVan = {
  vanKey: "van_1" | "van_2" | "van_3" | "van_5" | "van_6";
  displayName: string;
  /** Exact name in cloud.samsara.com (must match for CSV assign + GPS). */
  samsaraVehicleName: string;
  /** Vehicle Gateway serial when known (optional GPS fallback). */
  samsaraSerial: string | null;
  vin: string | null;
  licensePlate: string | null;
  makeModel: string | null;
};

/**
 * Identity captured from Fitdog Samsara fleet screenshots (2026-07-27).
 * Names in Samsara are already Van 01/02/03/05/06 — keep our DB locked to the same.
 */
export const FITDOG_SAMSARA_VANS: readonly FitdogSamsaraVan[] = [
  {
    vanKey: "van_1",
    displayName: "Van 1",
    samsaraVehicleName: "Van 01",
    samsaraSerial: "GXPD-PPW-GEV",
    vin: null,
    licensePlate: null,
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_2",
    displayName: "Van 2",
    samsaraVehicleName: "Van 02",
    samsaraSerial: "GW6E-ADZ-ATK",
    vin: "NM0LS7E74J1371466",
    licensePlate: "38516L2",
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_3",
    displayName: "Van 3",
    samsaraVehicleName: "Van 03",
    samsaraSerial: "GVE5-PCJ-7KK",
    vin: null,
    licensePlate: null,
    makeModel: "2018 FORD TRANSIT CONNECT"
  },
  {
    vanKey: "van_5",
    displayName: "Van 5",
    samsaraVehicleName: "Van 05",
    samsaraSerial: "GGR6-JKW-B6F",
    vin: "3N6CM0KN6JK701997",
    licensePlate: "69357N2",
    makeModel: "2018 NISSAN NV200"
  },
  {
    vanKey: "van_6",
    displayName: "Van 6",
    samsaraVehicleName: "Van 06",
    samsaraSerial: "GKEW-DZK-4NX",
    vin: "3N6CM0KN3MK705283",
    licensePlate: null,
    makeModel: "2021 NISSAN NV200"
  }
] as const;

export function getFitdogSamsaraVan(vanKey: string): FitdogSamsaraVan | undefined {
  return FITDOG_SAMSARA_VANS.find((v) => v.vanKey === vanKey);
}
