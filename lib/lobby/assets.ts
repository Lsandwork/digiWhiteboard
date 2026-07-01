export const LOBBY_ASSET_BASE = "/assets/fitdog-lobby-whiteboard";

export const lobbyAssets = {
  background: `${LOBBY_ASSET_BASE}/backgrounds/lobby-board-bg-1920x1080.png`,
  logoSvg: `${LOBBY_ASSET_BASE}/logos/fitdog-logo-placeholder.svg`,
  logoPng: `${LOBBY_ASSET_BASE}/logos/fitdog-logo-placeholder.png`,
  featuredGlow: `${LOBBY_ASSET_BASE}/ui/featured-card-orange-glow.png`,
  queueRowBg: `${LOBBY_ASSET_BASE}/ui/checkout-queue-row-bg.png`,
  syncedBadge: `${LOBBY_ASSET_BASE}/ui/synced-with-gingr-badge.svg`,
  statusReady: `${LOBBY_ASSET_BASE}/ui/status-pill-ready.png`,
  statusFrontDesk: `${LOBBY_ASSET_BASE}/ui/status-pill-front-desk.png`,
  statusWayOut: `${LOBBY_ASSET_BASE}/ui/status-pill-way-out.png`,
  spaBanner: `${LOBBY_ASSET_BASE}/promos/spa-day-sundays-banner.png`
} as const;

export function lobbyIconPath(iconKey: string | null | undefined) {
  const key = (iconKey ?? "paw").trim().toLowerCase();
  return `${LOBBY_ASSET_BASE}/icons/svg/icon-${key}.svg`;
}
