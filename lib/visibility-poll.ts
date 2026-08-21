/**
 * Shared visibility gate for operational polling.
 *
 * Hidden admin/TV tabs must not keep hitting live endpoints. Ticking on
 * visibilitychange covers sleep/wake without leaving a second interval running.
 */
export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

export function startVisibilityAwareInterval(
  tick: () => void,
  intervalMs: number
): () => void {
  const run = () => {
    if (!isDocumentVisible()) return;
    tick();
  };
  const timer = setInterval(run, Math.max(250, intervalMs));
  const onVisibility = () => {
    if (isDocumentVisible()) tick();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    clearInterval(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}
