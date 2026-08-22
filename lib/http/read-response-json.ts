import { LIVE_DATA_UNAVAILABLE_MESSAGE } from "@/lib/safe-url";

function looksLikeHtml(text: string) {
  const sample = text.slice(0, 400).toLowerCase();
  return sample.includes("<!doctype") || sample.includes("<html") || sample.includes("error code 522");
}

/**
 * Parse JSON from a fetch Response. Cloudflare/Supabase HTML 522 pages must
 * never reach `JSON.parse` — Safari throws "The string did not match the
 * expected pattern" and the raw HTML can render in the admin UI.
 */
export async function readResponseJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (contentType.includes("text/html") || looksLikeHtml(text)) {
    throw new Error(LIVE_DATA_UNAVAILABLE_MESSAGE);
  }

  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(LIVE_DATA_UNAVAILABLE_MESSAGE);
  }
}
