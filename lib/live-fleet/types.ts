/** Normalized Live Fleet models — UI consumes these, never raw Samsara payloads. */

export type LiveGpsStatus = "moving" | "parked" | "stale" | "offline" | "unknown";

export type LiveFreshness = "live" | "delayed" | "stale" | "unavailable";

export type LiveRouteStopStatus =
  | "completed"
  | "current"
  | "upcoming"
  | "skipped"
  | "exception"
  | "unknown";

export type LiveStopKind = "depot_start" | "customer" | "depot_end" | "manual" | "outing" | "other";

export type LiveStopDirection = "pickup" | "dropoff" | "departure" | "arrival" | "other";

export type LiveVehicleTelemetry = {
  vehicleId: string;
  samsaraVehicleId: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  speedMph: number | null;
  address: string | null;
  gpsTimestamp: string | null;
  receivedAt: string;
  status: LiveGpsStatus;
  simulated: boolean;
};

export type LiveFleetDog = {
  dogId: string | null;
  dogName: string;
  service: string | null;
  photoUrl: string | null;
  pickupStatus: LiveRouteStopStatus | null;
  dropoffStatus: LiveRouteStopStatus | null;
  pickupLocationType: string | null;
  dropoffLocationType: string | null;
  relevantStopId: string | null;
  timelineStatus: LiveRouteStopStatus;
};

export type LiveFleetStop = {
  id: string;
  sequence: number;
  stopKind: LiveStopKind;
  direction: LiveStopDirection;
  label: string;
  dogNames: string[];
  address: string | null;
  locationType: string | null;
  latitude: number | null;
  longitude: number | null;
  etaArrival: string | null;
  status: LiveRouteStopStatus;
  isNext: boolean;
};

export type LiveFleetNextStop = {
  stopId: string;
  dogName: string | null;
  stopType: LiveStopDirection;
  destination: string | null;
  locationType: string | null;
  etaMinutes: number | null;
  distanceMiles: number | null;
  etaReliable: boolean;
};

export type LiveFleetRouteSummary = {
  routeId: string;
  planId: string;
  routeName: string;
  serviceType: string | null;
  serviceTypes: string[];
  direction: "pickup" | "dropoff" | "combined" | string;
  waveName: string | null;
  driverName: string | null;
  startTime: string | null;
  estimatedCompletion: string | null;
  completedStops: number;
  remainingStops: number;
  totalStops: number;
  progressPercent: number;
  routeStatus: "active" | "complete" | "no_route" | "unknown";
  stops: LiveFleetStop[];
  dogs: LiveFleetDog[];
};

export type LiveFleetVehicle = {
  vanKey: string;
  ruffopsVehicleId: string;
  displayName: string;
  vehicleNumber: string | null;
  samsaraVehicleName: string | null;
  samsaraVehicleId: string | null;
  samsaraSerial: string | null;
  driverName: string | null;
  telemetry: LiveVehicleTelemetry | null;
  freshness: LiveFreshness;
  freshnessLabel: string;
  route: LiveFleetRouteSummary | null;
  nextStop: LiveFleetNextStop | null;
  dogCount: number;
  mappingStatus: "mapped" | "unmapped" | "partial";
  attention: string | null;
};

export type LiveFleetSyncMeta = {
  configured: boolean;
  simulated: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorStatus: number | null;
  lastUpdateCount: number;
  hasNextPage: boolean;
  syncSkipped: boolean;
  syncSkippedReason: string | null;
};

export type LiveFleetSnapshot = {
  operatingDate: string;
  generatedAt: string;
  vehicles: LiveFleetVehicle[];
  sync: LiveFleetSyncMeta;
  planId: string | null;
  planStatus: string | null;
  samsaraDashboardUrl: string;
};
