import { broadcastCastHardReload } from "@/lib/lobby/google-cast";

export async function requestCastHardRefreshAllDisplays() {
  const response = await fetch("/api/admin/cast-refresh", { method: "POST" });
  const body = (await response.json()) as { error?: string; cast_hard_reload_nonce?: number };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to refresh cast displays.");
  }

  await broadcastCastHardReload();

  return body.cast_hard_reload_nonce ?? 0;
}
