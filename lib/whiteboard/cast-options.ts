export type CastBoardType = "staff" | "lobby";

export type CastLiteOptions = {
  castMode: boolean;
  lite: boolean;
  noVideo: boolean;
  lowMotion: boolean;
  debugBoard: boolean;
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function flag(value: string | null | undefined) {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

export function parseCastLiteOptions(searchParams: URLSearchParams): Partial<CastLiteOptions> {
  const options: Partial<CastLiteOptions> = {};
  if (searchParams.has("castMode")) options.castMode = flag(searchParams.get("castMode"));
  if (searchParams.has("lite")) options.lite = flag(searchParams.get("lite"));
  if (searchParams.has("noVideo")) options.noVideo = flag(searchParams.get("noVideo"));
  if (searchParams.has("lowMotion")) options.lowMotion = flag(searchParams.get("lowMotion"));
  if (searchParams.has("debugBoard")) options.debugBoard = flag(searchParams.get("debugBoard"));
  return options;
}

export function defaultCastLiteOptions(board: CastBoardType): CastLiteOptions {
  return {
    castMode: true,
    lite: true,
    noVideo: false,
    lowMotion: true,
    debugBoard: false
  };
}

export function buildCastLiteQuery(options: Partial<CastLiteOptions> = {}) {
  const merged = {
    castMode: true,
    lite: true,
    lowMotion: true,
    noVideo: false,
    debugBoard: false,
    ...options
  };
  const params = new URLSearchParams();
  if (merged.castMode) params.set("castMode", "1");
  if (merged.lite) params.set("lite", "1");
  if (merged.lowMotion) params.set("lowMotion", "1");
  if (merged.noVideo) params.set("noVideo", "1");
  if (merged.debugBoard) params.set("debugBoard", "1");
  return params.toString();
}

export function buildStaffCastUrl(origin?: string) {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/`;
}

export function buildLobbyCastUrl(origin?: string) {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  return `${base}/lobby/checkouts`;
}
