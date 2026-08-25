import { broadcastCastHardReload } from "@/lib/lobby/google-cast";
import { readResponseJson } from "@/lib/http/read-response-json";

const CAST_REFRESH_CLIENT_TIMEOUT_MS = 8_000;

export async function requestCastHardRefreshAllDisplays() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CAST_REFRESH_CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch("/api/admin/cast-refresh", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    });
    const body = (await readResponseJson(response)) as {
      error?: string;
      ok?: boolean;
      cast_hard_reload_nonce?: number;
    };
    if (!response.ok || body.ok === false) {
      throw new Error(body.error ?? "Unable to refresh cast displays.");
    }

    await broadcastCastHardReload();

    return body.cast_hard_reload_nonce ?? 0;
  } catch (error) {
    const aborted =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && /aborted|abort/i.test(error.message));
    if (aborted) {
      throw new Error("Cast TV refresh timed out. Retry shortly.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
