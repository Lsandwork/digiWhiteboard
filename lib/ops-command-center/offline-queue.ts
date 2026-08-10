/**
 * Client-side offline / failure-safe action queue for critical floor workflows.
 * Persists pending actions in localStorage and retries when online.
 * Never silently drops an operational action.
 */

export type OfflineQueuedAction = {
  id: string;
  module: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  status: "waiting" | "syncing" | "synced" | "failed";
};

const STORAGE_KEY = "ruffops.ops.offline_queue.v1";

function readQueue(): OfflineQueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueuedAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineQueuedAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-200)));
}

export function listOfflineQueue() {
  return readQueue();
}

export function enqueueOfflineAction(input: {
  module: string;
  action: string;
  payload: Record<string, unknown>;
}) {
  const item: OfflineQueuedAction = {
    id: `offline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    module: input.module,
    action: input.action,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "waiting"
  };
  const next = [...readQueue(), item];
  writeQueue(next);
  return item;
}

export function markOfflineAction(id: string, patch: Partial<OfflineQueuedAction>) {
  const next = readQueue().map((item) => (item.id === id ? { ...item, ...patch } : item));
  writeQueue(next);
}

export async function flushOfflineQueue(
  sender: (item: OfflineQueuedAction) => Promise<{ ok: boolean; error?: string }>
) {
  const items = readQueue().filter((item) => item.status === "waiting" || item.status === "failed");
  for (const item of items) {
    markOfflineAction(item.id, { status: "syncing", attempts: item.attempts + 1 });
    try {
      const result = await sender(item);
      if (result.ok) markOfflineAction(item.id, { status: "synced", lastError: null });
      else markOfflineAction(item.id, { status: "failed", lastError: result.error || "Send failed" });
    } catch (error) {
      markOfflineAction(item.id, {
        status: "failed",
        lastError: error instanceof Error ? error.message : "Send failed"
      });
    }
  }
  return listOfflineQueue();
}
