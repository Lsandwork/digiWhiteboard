export const FITDOG_ASSET_BASE = "/assets/fitdog";
export const LOBBY_ASSET_BASE = "/assets/fitdog-lobby-whiteboard";
export const LOBBY_REFERENCE_BASE = "/assets/lobby-whiteboard/reference";

export const LOBBY_BRAND_ORANGE = "#F15F2A";
export const LOBBY_BRAND_TEAL = "#64B9DC";

export const fitdogAssets = {
  logoCircleBadge: `${FITDOG_ASSET_BASE}/fitdog-logo-circle-badge.svg`,
  logoWhite: `${FITDOG_ASSET_BASE}/fitdog-logo-white.svg`,
  pawAccent: `${FITDOG_ASSET_BASE}/paw-accent.svg`,
  serviceDaycare: `${FITDOG_ASSET_BASE}/service-daycare.svg`,
  serviceOvernight: `${FITDOG_ASSET_BASE}/service-overnight.svg`,
  serviceGrooming: `${FITDOG_ASSET_BASE}/service-grooming.svg`,
  serviceTaxi: `${FITDOG_ASSET_BASE}/service-taxi.svg`,
  serviceDogHiking: `${FITDOG_ASSET_BASE}/service-dog-hiking.svg`,
  serviceBeach: `${FITDOG_ASSET_BASE}/service-beach.svg`,
  servicePuppySocialization: `${FITDOG_ASSET_BASE}/service-puppy-socialization.svg`,
  serviceObedience: `${FITDOG_ASSET_BASE}/service-obedience.svg`,
  serviceFitness: `${FITDOG_ASSET_BASE}/service-fitness.svg`
} as const;

export const lobbyAssets = {
  background: `${LOBBY_ASSET_BASE}/02-backgrounds/fitdog-lobby-tv-bg-dark-active-1920x1080.png`,
  logoLockup: fitdogAssets.logoCircleBadge,
  logoBadge: fitdogAssets.logoCircleBadge,
  logoWhite: fitdogAssets.logoWhite,
  syncedBadge: `${LOBBY_ASSET_BASE}/03-ui-components/badge-live-sync-with-gingr.png`,
  heartIcon: `${LOBBY_ASSET_BASE}/icons/png/icon-heart.png`,
  calendarIcon: `${LOBBY_ASSET_BASE}/icons/png/icon-calendar.png`,
  eventsScenery: `${LOBBY_ASSET_BASE}/03-ui-components/card-events-dark.png`,
  statusReady: `${LOBBY_ASSET_BASE}/03-ui-components/status-now-ready-for-pickup.png`,
  statusFrontDesk: `${LOBBY_ASSET_BASE}/03-ui-components/status-ready-at-front-desk.png`,
  statusWayOut: `${LOBBY_ASSET_BASE}/03-ui-components/status-on-the-way-out.png`,
  statusGroom: `${LOBBY_ASSET_BASE}/03-ui-components/status-finishing-groom.png`,
  dogProfileFallback: fitdogAssets.logoCircleBadge,
  appIcon192: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-app-icon-192.png`,
  pawIcon: fitdogAssets.pawAccent,
  syncSignalIcon: `${LOBBY_ASSET_BASE}/04-icons/png/fitdog-icon-sync.png`
} as const;

const iconAliases: Record<string, string> = {
  paw: "paw",
  daycare: "daycare",
  overnight: "overnight",
  grooming: "grooming",
  taxi: "taxi",
  transport: "taxi",
  hiking: "hiking",
  beach: "beach",
  puppy: "puppy-socialization",
  "puppy-socialization": "puppy-socialization",
  obedience: "obedience",
  training: "obedience",
  fitness: "fitness",
  calendar: "events",
  events: "events",
  member: "member"
};

const fitdogServiceIcons: Record<string, string> = {
  daycare: fitdogAssets.serviceDaycare,
  overnight: fitdogAssets.serviceOvernight,
  grooming: fitdogAssets.serviceGrooming,
  taxi: fitdogAssets.serviceTaxi,
  hiking: fitdogAssets.serviceDogHiking,
  beach: fitdogAssets.serviceBeach,
  "puppy-socialization": fitdogAssets.servicePuppySocialization,
  obedience: fitdogAssets.serviceObedience,
  fitness: fitdogAssets.serviceFitness
};

export function lobbyServiceIconPath(iconKey: string | null | undefined) {
  const normalized = (iconKey ?? "paw").trim().toLowerCase();
  const resolved = iconAliases[normalized] ?? normalized;
  return fitdogServiceIcons[resolved] ?? lobbyIconPath(resolved, "svg");
}

export function lobbyServiceIconFallbackPath(iconKey: string | null | undefined) {
  const normalized = (iconKey ?? "paw").trim().toLowerCase();
  const resolved = iconAliases[normalized] ?? normalized;
  return lobbyIconPath(resolved, "png");
}

export function lobbyIconPath(iconKey: string | null | undefined, format: "svg" | "png" = "png") {
  const normalized = (iconKey ?? "paw").trim().toLowerCase();
  const resolved = iconAliases[normalized] ?? normalized;
  const folder = format === "png" ? "png" : "svg";
  const prefix = format === "png" ? "fitdog-icon" : "fitdog-icon";
  return `${LOBBY_ASSET_BASE}/04-icons/${folder}/${prefix}-${resolved}.${format}`;
}

export function lobbyStatusAsset(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("front desk")) return lobbyAssets.statusFrontDesk;
  if (normalized.includes("groom")) return lobbyAssets.statusGroom;
  if (normalized.includes("ready") || normalized.includes("pickup")) return lobbyAssets.statusReady;
  return lobbyAssets.statusWayOut;
}
