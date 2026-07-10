export type RemoteCastScreen = "standby" | "lobby" | "staff" | "blackout";

export type RemoteCastStatus = "online" | "offline" | "reconnecting" | "error";

export type RemoteCastCommand =
  | "CAST_LOBBY"
  | "CAST_STAFF"
  | "REFRESH"
  | "BLACKOUT"
  | "WAKE"
  | "STANDBY"
  | "RENAME_DISPLAY";

export const REMOTE_CAST_COMMANDS: RemoteCastCommand[] = [
  "CAST_LOBBY",
  "CAST_STAFF",
  "REFRESH",
  "BLACKOUT",
  "WAKE",
  "STANDBY",
  "RENAME_DISPLAY"
];

export const REMOTE_CAST_SCREENS: RemoteCastScreen[] = ["standby", "lobby", "staff", "blackout"];

/** Receiver → server heartbeat cadence. */
export const RECEIVER_HEARTBEAT_MS = 20_000;
/** Receiver desired-state poll cadence (fast path so commands land quickly). */
export const RECEIVER_STATE_POLL_MS = 6_000;
/** Admin panel receiver-list refresh cadence. */
export const ADMIN_RECEIVERS_POLL_MS = 10_000;
/** A receiver is considered offline if not seen within this window. */
export const RECEIVER_OFFLINE_THRESHOLD_MS = 75_000;
/** Pairing codes expire if not claimed within this window. */
export const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

export const RECEIVER_TOKEN_HEADER = "x-receiver-token";
export const RECEIVER_TOKEN_STORAGE_KEY = "fitdog_remote_cast_receiver";

/** Public (browser-safe) receiver record for the admin panel. */
export type RemoteCastReceiverPublic = {
  id: string;
  displayName: string | null;
  status: RemoteCastStatus;
  online: boolean;
  activeScreen: RemoteCastScreen;
  lastCommand: string | null;
  pairingCode: string | null;
  pairingExpired: boolean;
  paired: boolean;
  lastSeenAt: string | null;
  pairedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** State payload returned to a receiver (never contains secrets). */
export type RemoteCastReceiverState = {
  paired: boolean;
  displayName: string | null;
  activeScreen: RemoteCastScreen;
  pairingCode: string | null;
  pairingExpired: boolean;
  refreshNonce: number;
  updatedAt: string | null;
};

export function isRemoteCastScreen(value: unknown): value is RemoteCastScreen {
  return typeof value === "string" && (REMOTE_CAST_SCREENS as string[]).includes(value);
}

export function isRemoteCastCommand(value: unknown): value is RemoteCastCommand {
  return typeof value === "string" && (REMOTE_CAST_COMMANDS as string[]).includes(value);
}

export function screenLabel(screen: RemoteCastScreen): string {
  switch (screen) {
    case "lobby":
      return "Lobby Whiteboard";
    case "staff":
      return "Staff Whiteboard";
    case "blackout":
      return "Blackout";
    case "standby":
    default:
      return "Standby";
  }
}
