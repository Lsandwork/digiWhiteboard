import { isAllowedGingrPhotoUrl, parseHttpUrl } from "@/lib/gingr-photo-display";

const MAX_REDIRECTS = 3;

/** Raster formats only. SVG is never served: it executes script when opened on our origin. */
const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif"
]);
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

export const PROXY_IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-site"
} as const;

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (host.includes(":")) return true;
  return false;
}

export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (HEIF_BRANDS.has(brand)) return brand === "mif1" || brand === "msf1" ? "image/heif" : "image/heic";
  }
  return null;
}

async function readLimited(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > maxBytes ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

type FetchImageOptions = {
  maxBytes: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

/**
 * Fetches one image with manual redirects. Every hop must stay on the starting host or
 * an allowed Gingr photo URL, never a private/IP host. Only raster images are returned.
 */
export async function fetchProxiedImage(start: string, options: FetchImageOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const startUrl = parseHttpUrl(start);
  if (!startUrl || isPrivateOrLocalHost(startUrl.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(current.toString(), {
        cache: "force-cache",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          Referer: ""
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const next = location ? parseHttpUrl(new URL(location, current)) : null;
        if (!next || isPrivateOrLocalHost(next.hostname)) return null;
        if (next.hostname.toLowerCase() !== startUrl.hostname.toLowerCase() && !isAllowedGingrPhotoUrl(next)) return null;
        current = next;
        continue;
      }

      if (!response.ok) return null;
      const declaredType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (declaredType && !SAFE_IMAGE_TYPES.has(declaredType)) return null;

      const buffer = await readLimited(response, options.maxBytes);
      if (!buffer || !buffer.length) return null;
      const sniffed = sniffImageType(buffer);
      if (!sniffed) return null;
      return { buffer, contentType: sniffed };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Bounds unauthenticated "re-ask Gingr" lookups: one per dog per cooldown, and a per-instance
 * budget per minute. Only reduces Gingr traffic relative to the previous behavior.
 */
export function createFreshLookupGate(options: { cooldownMs: number; perMinute: number; maxTracked?: number }) {
  const lastLookup = new Map<string, number>();
  const recent: number[] = [];
  const maxTracked = options.maxTracked ?? 5_000;

  return function allowFreshLookup(animalId: string, now = Date.now()) {
    const previous = lastLookup.get(animalId);
    if (previous !== undefined && now - previous < options.cooldownMs) return false;
    while (recent.length && now - recent[0] > 60_000) recent.shift();
    if (recent.length >= options.perMinute) return false;
    recent.push(now);
    if (lastLookup.size >= maxTracked && !lastLookup.has(animalId)) {
      const oldest = lastLookup.keys().next().value;
      if (oldest !== undefined) lastLookup.delete(oldest);
    }
    lastLookup.delete(animalId);
    lastLookup.set(animalId, now);
    return true;
  };
}
