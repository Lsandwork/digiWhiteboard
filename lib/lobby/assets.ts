export const LOBBY_ASSET_BASE = "/assets/fitdog-lobby-whiteboard";
export const LOBBY_REFERENCE_BASE = "/assets/lobby-whiteboard/reference";

export const LOBBY_BRAND_ORANGE = "#F15F2A";
export const LOBBY_BRAND_TEAL = "#64B9DC";

export const lobbyAssets = {
  background: `${LOBBY_ASSET_BASE}/02-backgrounds/fitdog-lobby-tv-bg-dark-active-1920x1080.png`,
  backgroundLight: `${LOBBY_ASSET_BASE}/02-backgrounds/fitdog-lobby-tv-bg-coastal-light-1920x1080.png`,
  logoLockup: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-logo-lockup-dark-transparent.png`,
  logoBadge: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-logo-circle-badge-512.png`,
  logoMark: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-logo-mark-transparent.png`,
  appIcon192: `${LOBBY_ASSET_BASE}/01-brand/logo/fitdog-app-icon-192.png`,
  featuredCard: `${LOBBY_ASSET_BASE}/03-ui-components/featured-checkout-card-fitdog-gradient.png`,
  featuredGlow: `${LOBBY_ASSET_BASE}/03-ui-components/card-featured-checkout-dark-glow.png`,
  queueRowBg: `${LOBBY_ASSET_BASE}/03-ui-components/card-queue-list-dark.png`,
  idleCard: `${LOBBY_ASSET_BASE}/03-ui-components/card-idle-state-dark.png`,
  servicesCard: `${LOBBY_ASSET_BASE}/03-ui-components/card-services-dark.png`,
  eventsCard: `${LOBBY_ASSET_BASE}/03-ui-components/card-events-dark.png`,
  syncedBadge: `${LOBBY_ASSET_BASE}/03-ui-components/badge-live-sync-with-gingr.svg`,
  footerBar: `${LOBBY_ASSET_BASE}/03-ui-components/footer-message-bar.png`,
  statusReady: `${LOBBY_ASSET_BASE}/03-ui-components/status-now-ready-for-pickup.png`,
  statusFrontDesk: `${LOBBY_ASSET_BASE}/03-ui-components/status-ready-at-front-desk.png`,
  statusWayOut: `${LOBBY_ASSET_BASE}/03-ui-components/status-on-the-way-out.png`,
  statusGroom: `${LOBBY_ASSET_BASE}/03-ui-components/status-finishing-groom.png`,
  dogProfileFallback: `${LOBBY_ASSET_BASE}/05-dog-placeholders/dog-profile-fallback-fitdog-logo.png`,
  mockupReference: `${LOBBY_ASSET_BASE}/09-mockup-reference/fitdog-lobby-checkout-board-layout-reference-with-provided-logo.png`,
  implementationReference: `${LOBBY_REFERENCE_BASE}/cursor-implementation-requirements.png`,
  pawPattern: `${LOBBY_ASSET_BASE}/07-patterns/paw-pattern-fitdog-orange.svg`
} as const;

const iconAliases: Record<string, string> = {
  paw: "paw",
  daycare: "daycare",
  overnight: "overnight",
  grooming: "grooming",
  scissors: "grooming",
  taxi: "taxi",
  transport: "taxi",
  hiking: "hiking",
  beach: "beach",
  puppy: "puppy-socialization",
  "puppy-socialization": "puppy-socialization",
  obedience: "obedience",
  training: "obedience",
  fitness: "fitness",
  dumbbell: "fitness",
  puzzle: "agility",
  agility: "agility",
  boarding: "overnight",
  calendar: "events",
  events: "events",
  sync: "sync",
  bell: "workshop",
  workshop: "workshop",
  member: "member"
};

export function lobbyIconPath(iconKey: string | null | undefined) {
  const normalized = (iconKey ?? "paw").trim().toLowerCase();
  const resolved = iconAliases[normalized] ?? normalized;
  return `${LOBBY_ASSET_BASE}/04-icons/svg/fitdog-icon-${resolved}.svg`;
}

export function lobbyStatusAsset(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("front desk")) return lobbyAssets.statusFrontDesk;
  if (normalized.includes("groom")) return lobbyAssets.statusGroom;
  if (normalized.includes("ready") || normalized.includes("pickup")) return lobbyAssets.statusReady;
  return lobbyAssets.statusWayOut;
}
