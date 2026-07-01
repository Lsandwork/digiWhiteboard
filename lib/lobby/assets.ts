export const LOBBY_ASSET_BASE = "/assets/fitdog-lobby-whiteboard";
export const LOBBY_REFERENCE_BASE = "/assets/lobby-whiteboard/reference";

export const LOBBY_BRAND_ORANGE = "#F15F2A";
export const LOBBY_BRAND_TEAL = "#64B9DC";

export const lobbyAssets = {
  background: `${LOBBY_ASSET_BASE}/02-backgrounds/fitdog-lobby-tv-bg-dark-active-1920x1080.png`,
  logoLockup: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-logo-lockup-dark-transparent.png`,
  logoBadge: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-logo-circle-badge-512.png`,
  syncedBadge: `${LOBBY_ASSET_BASE}/03-ui-components/badge-live-sync-with-gingr.png`,
  heartIcon: `${LOBBY_ASSET_BASE}/icons/png/icon-heart.png`,
  calendarIcon: `${LOBBY_ASSET_BASE}/icons/png/icon-calendar.png`,
  eventsScenery: `${LOBBY_ASSET_BASE}/03-ui-components/card-events-dark.png`,
  statusReady: `${LOBBY_ASSET_BASE}/03-ui-components/status-now-ready-for-pickup.png`,
  statusFrontDesk: `${LOBBY_ASSET_BASE}/03-ui-components/status-ready-at-front-desk.png`,
  statusWayOut: `${LOBBY_ASSET_BASE}/03-ui-components/status-on-the-way-out.png`,
  statusGroom: `${LOBBY_ASSET_BASE}/03-ui-components/status-finishing-groom.png`,
  dogProfileFallback: `${LOBBY_ASSET_BASE}/05-dog-placeholders/dog-profile-fallback-fitdog-logo.png`,
  appIcon192: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-app-icon-192.png`,
  pawIcon: `${LOBBY_ASSET_BASE}/04-icons/png/fitdog-icon-paw.png`,
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
