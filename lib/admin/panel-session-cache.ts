/**
 * In-tab session cache so remounted admin panels paint last-good data instantly
 * while a quiet revalidate runs. Module-scoped — survives remount, not hard refresh.
 */

type CacheEntry<T> = {
  value: T;
  savedAt: number;
};

const memory = new Map<string, CacheEntry<unknown>>();

export function readPanelCache<T>(key: string, maxAgeMs: number): T | null {
  const entry = memory.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.savedAt > maxAgeMs) return null;
  return entry.value;
}

export function writePanelCache<T>(key: string, value: T) {
  memory.set(key, { value, savedAt: Date.now() });
}

export function clearPanelCache(keyPrefix?: string) {
  if (!keyPrefix) {
    memory.clear();
    return;
  }
  for (const key of memory.keys()) {
    if (key === keyPrefix || key.startsWith(keyPrefix)) memory.delete(key);
  }
}
