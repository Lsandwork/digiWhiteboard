/**
 * Simple autosave helper for operational notes / forms.
 */

export function loadAutosave<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`ruffops.autosave.${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `ruffops.autosave.${key}`,
      JSON.stringify({ savedAt: new Date().toISOString(), value })
    );
  } catch {
    // Ignore quota errors.
  }
}

export function clearAutosave(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`ruffops.autosave.${key}`);
}
