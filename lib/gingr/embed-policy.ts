import { GINGR_EMPLOYEE_URL } from "@/lib/gingr/constants";

export type GingrEmbedPolicy = {
  allowed: boolean;
  reason: string | null;
};

const EMBED_POLICY_CACHE_MS = 5 * 60 * 1000;
let cachedPolicy: { checkedAt: number; policy: GingrEmbedPolicy } | null = null;

function parseFrameAncestors(csp: string | null): string | null {
  if (!csp) return null;
  const match = csp.match(/frame-ancestors\s+([^;]+)/i);
  return match?.[1]?.trim() ?? null;
}

function frameAncestorsBlocksEmbed(frameAncestors: string): boolean {
  const normalized = frameAncestors.toLowerCase();
  if (normalized.includes("'none'")) return true;
  if (normalized.includes("*")) return false;
  if (normalized.includes("'self'") && !normalized.includes("fitdog") && !normalized.includes("ruffops")) {
    return true;
  }
  return false;
}

/** Inspect Gingr response headers to predict iframe embedding support. */
export async function inspectGingrEmbedPolicy(): Promise<GingrEmbedPolicy> {
  const now = Date.now();
  if (cachedPolicy && now - cachedPolicy.checkedAt < EMBED_POLICY_CACHE_MS) {
    return cachedPolicy.policy;
  }

  try {
    const response = await fetch(GINGR_EMPLOYEE_URL, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store"
    });

    const xFrameOptions = response.headers.get("x-frame-options");
    if (xFrameOptions) {
      const normalized = xFrameOptions.trim().toLowerCase();
      if (normalized === "deny" || normalized === "sameorigin") {
        const policy = {
          allowed: false,
          reason: `Gingr responded with X-Frame-Options: ${xFrameOptions.trim()}`
        };
        cachedPolicy = { checkedAt: now, policy };
        return policy;
      }
    }

    const csp = response.headers.get("content-security-policy");
    const frameAncestors = parseFrameAncestors(csp);
    if (frameAncestors && frameAncestorsBlocksEmbed(frameAncestors)) {
      const policy = {
        allowed: false,
        reason: `Gingr Content-Security-Policy frame-ancestors excludes this application (${frameAncestors})`
      };
      cachedPolicy = { checkedAt: now, policy };
      return policy;
    }

    const policy = { allowed: true, reason: null };
    cachedPolicy = { checkedAt: now, policy };
    return policy;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect Gingr headers";
    return { allowed: true, reason: message };
  }
}
