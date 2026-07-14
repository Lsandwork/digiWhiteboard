import { createHash, randomBytes, randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PAIRING_CODE_TTL_MS,
  RECEIVER_OFFLINE_THRESHOLD_MS,
  isRemoteCastScreen,
  type RemoteCastCommand,
  type RemoteCastReceiverPublic,
  type RemoteCastReceiverState,
  type RemoteCastScreen
} from "@/lib/remote-cast/types";
import { isCastDisplayOpenHours } from "@/lib/remote-cast/hours";

const RECEIVERS_TABLE = "remote_cast_receivers";
const COMMANDS_TABLE = "remote_cast_commands";

type ReceiverRow = {
  id: string;
  display_name: string | null;
  pairing_code: string | null;
  pairing_code_expires_at: string | null;
  receiver_token_hash: string;
  status: string;
  active_screen: string;
  last_command: string | null;
  refresh_nonce: number | null;
  last_seen_at: string | null;
  paired_at: string | null;
  created_at: string;
  updated_at: string;
};

export function hashReceiverToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function generateReceiverToken(): string {
  return randomBytes(32).toString("hex");
}

function generatePairingCodeCandidate(): string {
  // FITDOG-#### — short, readable, easy to type on a phone.
  return `FITDOG-${randomInt(1000, 10000)}`;
}

function coerceScreen(value: unknown, fallback: RemoteCastScreen = "standby"): RemoteCastScreen {
  return isRemoteCastScreen(value) ? value : fallback;
}

function isPairingExpired(row: ReceiverRow): boolean {
  if (row.paired_at) return false;
  if (!row.pairing_code_expires_at) return false;
  return new Date(row.pairing_code_expires_at).getTime() < Date.now();
}

function isOnline(row: ReceiverRow): boolean {
  if (!row.last_seen_at) return false;
  return Date.now() - new Date(row.last_seen_at).getTime() <= RECEIVER_OFFLINE_THRESHOLD_MS;
}

export function toPublicReceiver(row: ReceiverRow): RemoteCastReceiverPublic {
  const online = isOnline(row);
  const paired = Boolean(row.paired_at);
  return {
    id: row.id,
    displayName: row.display_name,
    status: online ? "online" : "offline",
    online,
    activeScreen: coerceScreen(row.active_screen),
    lastCommand: row.last_command,
    pairingCode: paired ? null : row.pairing_code,
    pairingExpired: isPairingExpired(row),
    paired,
    lastSeenAt: row.last_seen_at,
    pairedAt: row.paired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toReceiverState(row: ReceiverRow): RemoteCastReceiverState {
  const paired = Boolean(row.paired_at);
  return {
    paired,
    displayName: row.display_name,
    activeScreen: coerceScreen(row.active_screen),
    pairingCode: paired ? null : row.pairing_code,
    pairingExpired: isPairingExpired(row),
    refreshNonce: row.refresh_nonce ?? 0,
    updatedAt: row.updated_at
  };
}

async function generateUniquePairingCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generatePairingCodeCandidate();
    const { data } = await supabase
      .from(RECEIVERS_TABLE)
      .select("id")
      .eq("pairing_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely — fall back to a longer code.
  return `FITDOG-${randomInt(10000, 100000)}`;
}

async function getReceiverRowByToken(supabase: SupabaseClient, token: string): Promise<ReceiverRow | null> {
  const tokenHash = hashReceiverToken(token);
  const { data } = await supabase
    .from(RECEIVERS_TABLE)
    .select("*")
    .eq("receiver_token_hash", tokenHash)
    .maybeSingle();
  return (data as ReceiverRow | null) ?? null;
}

async function getReceiverRowById(supabase: SupabaseClient, id: string): Promise<ReceiverRow | null> {
  const { data } = await supabase.from(RECEIVERS_TABLE).select("*").eq("id", id).maybeSingle();
  return (data as ReceiverRow | null) ?? null;
}

export type RegisterResult = {
  receiverId: string;
  receiverToken: string | null;
  state: RemoteCastReceiverState;
};

/**
 * Called by a receiver on first load (or when its stored token is unknown).
 * - Unknown/no token → create a fresh receiver + pairing code, return the token.
 * - Known unpaired token with expired code → regenerate the pairing code.
 * - Known token → return current state (token not re-issued).
 */
export async function registerReceiver(
  supabase: SupabaseClient,
  options: { existingToken?: string | null } = {}
): Promise<RegisterResult> {
  const existingToken = options.existingToken?.trim() || null;

  if (existingToken) {
    const existing = await getReceiverRowByToken(supabase, existingToken);
    if (existing) {
      if (!existing.paired_at && isPairingExpired(existing)) {
        const pairingCode = await generateUniquePairingCode(supabase);
        const { data } = await supabase
          .from(RECEIVERS_TABLE)
          .update({
            pairing_code: pairingCode,
            pairing_code_expires_at: new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        return { receiverId: existing.id, receiverToken: null, state: toReceiverState(data as ReceiverRow) };
      }
      return { receiverId: existing.id, receiverToken: null, state: toReceiverState(existing) };
    }
  }

  const token = generateReceiverToken();
  const pairingCode = await generateUniquePairingCode(supabase);
  const { data, error } = await supabase
    .from(RECEIVERS_TABLE)
    .insert({
      receiver_token_hash: hashReceiverToken(token),
      pairing_code: pairingCode,
      pairing_code_expires_at: new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString(),
      status: "offline",
      active_screen: "standby"
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to register receiver.");
  }

  return { receiverId: (data as ReceiverRow).id, receiverToken: token, state: toReceiverState(data as ReceiverRow) };
}

export async function getStateForToken(
  supabase: SupabaseClient,
  token: string
): Promise<RemoteCastReceiverState | null> {
  const row = await getReceiverRowByToken(supabase, token);
  if (!row) return null;
  return toReceiverState(row);
}

export type HeartbeatResult = { ok: boolean; state: RemoteCastReceiverState | null };

export async function recordHeartbeat(
  supabase: SupabaseClient,
  token: string,
  reportedScreen?: unknown
): Promise<HeartbeatResult> {
  const row = await getReceiverRowByToken(supabase, token);
  if (!row) return { ok: false, state: null };

  const patch: Record<string, unknown> = {
    status: "online",
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  // The receiver reports what it is actually showing; keep it in sync but never
  // override an admin's desired screen (admin writes active_screen via commands).
  if (isRemoteCastScreen(reportedScreen) && reportedScreen === row.active_screen) {
    patch.active_screen = reportedScreen;
  }

  const { data } = await supabase
    .from(RECEIVERS_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  return { ok: true, state: toReceiverState((data as ReceiverRow) ?? row) };
}

export async function listReceivers(supabase: SupabaseClient): Promise<RemoteCastReceiverPublic[]> {
  const { data, error } = await supabase
    .from(RECEIVERS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as ReceiverRow[]) ?? []).map(toPublicReceiver);
}

export async function pairReceiver(
  supabase: SupabaseClient,
  options: { pairingCode: string; displayName?: string | null; createdBy?: string | null }
): Promise<{ ok: boolean; receiver?: RemoteCastReceiverPublic; error?: string }> {
  const code = options.pairingCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a pairing code." };

  const { data } = await supabase
    .from(RECEIVERS_TABLE)
    .select("*")
    .eq("pairing_code", code)
    .maybeSingle();
  const row = data as ReceiverRow | null;

  if (!row) return { ok: false, error: "Pairing code not found. Check the code on the display." };
  if (row.paired_at) return { ok: false, error: "This display is already paired." };
  if (isPairingExpired(row)) {
    return { ok: false, error: "This pairing code has expired. Refresh the display to get a new code." };
  }

  const displayName = options.displayName?.trim() || row.display_name || "Fitdog Display";
  const { data: updated, error } = await supabase
    .from(RECEIVERS_TABLE)
    .update({
      display_name: displayName,
      paired_at: new Date().toISOString(),
      pairing_code_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !updated) return { ok: false, error: error?.message ?? "Unable to pair display." };

  await supabase.from(COMMANDS_TABLE).insert({
    receiver_id: row.id,
    command: "RENAME_DISPLAY",
    payload: { pairing: true },
    created_by: options.createdBy ?? null,
    status: "executed",
    executed_at: new Date().toISOString()
  });

  // During building hours, bring newly paired displays online immediately
  // so staff do not need a manual Wake/Cast after pairing.
  if (isCastDisplayOpenHours()) {
    const woke = await issueCommand(supabase, {
      receiverId: row.id,
      command: "WAKE",
      createdBy: options.createdBy ?? null
    });
    if (woke.ok && woke.receiver) {
      return { ok: true, receiver: woke.receiver };
    }
  }

  return { ok: true, receiver: toPublicReceiver(updated as ReceiverRow) };
}

async function lastContentScreen(supabase: SupabaseClient, receiverId: string): Promise<RemoteCastScreen> {
  const { data } = await supabase
    .from(COMMANDS_TABLE)
    .select("screen")
    .eq("receiver_id", receiverId)
    .in("command", ["CAST_LOBBY", "CAST_STAFF"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const screen = (data as { screen: string | null } | null)?.screen;
  return isRemoteCastScreen(screen) && (screen === "lobby" || screen === "staff") ? screen : "lobby";
}

export async function issueCommand(
  supabase: SupabaseClient,
  options: {
    receiverId: string;
    command: RemoteCastCommand;
    screen?: RemoteCastScreen | null;
    displayName?: string | null;
    createdBy?: string | null;
  }
): Promise<{ ok: boolean; receiver?: RemoteCastReceiverPublic; error?: string }> {
  const row = await getReceiverRowById(supabase, options.receiverId);
  if (!row) return { ok: false, error: "Display not found." };

  const patch: Record<string, unknown> = {
    last_command: options.command,
    updated_at: new Date().toISOString()
  };
  let commandScreen: RemoteCastScreen | null = null;

  switch (options.command) {
    case "CAST_LOBBY":
      patch.active_screen = "lobby";
      commandScreen = "lobby";
      break;
    case "CAST_STAFF":
      patch.active_screen = "staff";
      commandScreen = "staff";
      break;
    case "BLACKOUT":
      patch.active_screen = "blackout";
      commandScreen = "blackout";
      break;
    case "STANDBY":
      patch.active_screen = "standby";
      commandScreen = "standby";
      break;
    case "WAKE": {
      const restore =
        row.active_screen === "blackout" || row.active_screen === "standby"
          ? await lastContentScreen(supabase, row.id)
          : coerceScreen(row.active_screen, "lobby");
      patch.active_screen = restore;
      commandScreen = restore;
      break;
    }
    case "REFRESH":
      patch.refresh_nonce = (row.refresh_nonce ?? 0) + 1;
      break;
    case "RENAME_DISPLAY":
      if (options.displayName?.trim()) {
        patch.display_name = options.displayName.trim();
      }
      break;
    default:
      return { ok: false, error: "Unsupported command." };
  }

  const { data: updated, error } = await supabase
    .from(RECEIVERS_TABLE)
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error || !updated) return { ok: false, error: error?.message ?? "Unable to send command." };

  await supabase.from(COMMANDS_TABLE).insert({
    receiver_id: row.id,
    command: options.command,
    screen: commandScreen,
    payload: options.displayName ? { display_name: options.displayName } : {},
    created_by: options.createdBy ?? null,
    status: "executed",
    executed_at: new Date().toISOString()
  });

  return { ok: true, receiver: toPublicReceiver(updated as ReceiverRow) };
}

export async function removeReceiver(supabase: SupabaseClient, receiverId: string): Promise<boolean> {
  const { error } = await supabase.from(RECEIVERS_TABLE).delete().eq("id", receiverId);
  return !error;
}
