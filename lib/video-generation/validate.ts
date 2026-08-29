import { LOBBY_AD_HEIGHT, LOBBY_AD_MAX_SECONDS, LOBBY_AD_MIN_SECONDS, LOBBY_AD_WIDTH } from "./constants";

export type ProbedMedia = {
  duration: number;
  width: number;
  height: number;
  videoCodec: string | null;
  audioCodec: string | null;
};

export function assertLobbyAdOutput(filePath: string, probe: ProbedMedia) {
  if (probe.width !== LOBBY_AD_WIDTH || probe.height !== LOBBY_AD_HEIGHT) {
    throw new Error(`${filePath} is ${probe.width}x${probe.height}, expected ${LOBBY_AD_WIDTH}x${LOBBY_AD_HEIGHT}`);
  }
  if (probe.duration < LOBBY_AD_MIN_SECONDS - 0.35 || probe.duration > LOBBY_AD_MAX_SECONDS + 0.5) {
    throw new Error(`${filePath} duration ${probe.duration.toFixed(2)}s is outside ${LOBBY_AD_MIN_SECONDS}-${LOBBY_AD_MAX_SECONDS}s`);
  }
  if (probe.videoCodec !== "h264") {
    throw new Error(`${filePath} video codec is ${probe.videoCodec}, expected h264`);
  }
  if (!probe.audioCodec) {
    throw new Error(`${filePath} has no audio track`);
  }
}
