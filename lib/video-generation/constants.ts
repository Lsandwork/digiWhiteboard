import { join } from "node:path";

/** Official Fitdog orange sampled from the provided logo. */
export const FITDOG_ORANGE = "#F15F2A";
export const FITDOG_BLACK = "#0B0B0B";
export const FITDOG_WHITE = "#FFFFFF";

export const LOBBY_AD_WIDTH = 1920;
export const LOBBY_AD_HEIGHT = 1080;
export const LOBBY_AD_FPS = 24;
export const LOBBY_AD_MIN_SECONDS = 15;
export const LOBBY_AD_MAX_SECONDS = 20;

export const CONSISTENCY_SEED = 1712;

export const REAL_FITDOG_LOCKUP_LIGHT =
  "public/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-lockup-light-transparent.png";
export const REAL_FITDOG_LOCKUP_DARK =
  "public/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-lockup-dark-transparent.png";
export const REAL_FITDOG_CIRCLE_BADGE =
  "public/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png";

export const LOBBY_AD_PUBLIC_DIR = "public/assets/fitdog/lobby-ads";
export const LOBBY_AD_REFERENCES_DIR = join(LOBBY_AD_PUBLIC_DIR, "references");
export const LOCATION_REFERENCE_FILE = join(LOBBY_AD_REFERENCES_DIR, "fitdog-entrance-1712.png");
export const FINAL_AD_FILE = join(LOBBY_AD_PUBLIC_DIR, "the-miraculous-recovery.mp4");

export const DEFAULT_CACHE_DIR = "videos/raw/miraculous-recovery";
export const DEFAULT_VEO_MODEL = "veo-3.1-fast-generate-preview";
export const DEFAULT_VEO_RESOLUTION: "1080p" = "1080p";

export const INTER_BOLD = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf";
export const INTER_SEMI = "/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf";

export const END_CARD_DURATION_SECONDS = 2;
export const END_CARD_HEADLINE = ["THE MIRACULOUS CURE", "FOR A 'LAZY DAY.'"] as const;
