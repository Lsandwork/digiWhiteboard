import { GingrAuthError, GingrIntegrationError, GingrRateLimitError } from "@/lib/integrations/gingr/errors";
import type { GingrAnimal, GingrOwner, GingrReservation } from "@/lib/integrations/gingr/types";

export type GingrClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  locationId?: string;
  subdomain?: string;
};

function resolveConfig(overrides?: GingrClientConfig): Required<GingrClientConfig> {
  const subdomain = overrides?.subdomain || process.env.GINGR_SUBDOMAIN?.trim() || "fitdog";
  const baseUrl =
    overrides?.baseUrl ||
    process.env.GINGR_BASE_URL?.trim() ||
    `https://${subdomain}.gingrapp.com`;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: overrides?.apiKey || process.env.GINGR_API_KEY?.trim() || "",
    locationId: overrides?.locationId || process.env.GINGR_LOCATION_ID?.trim() || "1",
    subdomain
  };
}

export function createGingrClient(overrides?: GingrClientConfig) {
  const config = resolveConfig(overrides);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!config.apiKey) {
      throw new GingrAuthError("GINGR_API_KEY is not configured.");
    }
    const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Api-Key": config.apiKey,
        ...(init?.headers || {})
      },
      cache: "no-store"
    });
    if (response.status === 401 || response.status === 403) {
      throw new GingrAuthError();
    }
    if (response.status === 429) {
      throw new GingrRateLimitError();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new GingrIntegrationError(
        `Gingr API ${response.status}: ${text.slice(0, 200) || response.statusText}`,
        "gingr_http",
        response.status
      );
    }
    return (await response.json()) as T;
  }

  return {
    config,
    async testConnection() {
      // Lightweight probe — many Gingr installs expose location/list style endpoints.
      // Failures surface as typed errors for the Integrations UI.
      try {
        await request(`/api/locations`);
        return { ok: true as const, message: "Gingr API reachable." };
      } catch (error) {
        // Fallback probe with query form used by some Gingr API docs
        try {
          await request(`/api/owners?limit=1`);
          return { ok: true as const, message: "Gingr API reachable (owners probe)." };
        } catch (second) {
          const message = second instanceof Error ? second.message : "Gingr connection failed.";
          return { ok: false as const, message };
        }
      }
    },
    getOwner(ownerId: string) {
      return request<GingrOwner>(`/api/owners/${encodeURIComponent(ownerId)}`);
    },
    listOwners(params?: { modified_since?: string; limit?: number }) {
      const q = new URLSearchParams();
      if (params?.modified_since) q.set("modified_since", params.modified_since);
      if (params?.limit) q.set("limit", String(params.limit));
      const suffix = q.toString() ? `?${q}` : "";
      return request<GingrOwner[]>(`/api/owners${suffix}`);
    },
    getAnimal(animalId: string) {
      return request<GingrAnimal>(`/api/animals/${encodeURIComponent(animalId)}`);
    },
    listReservationsByDate(date: string) {
      return request<GingrReservation[]>(`/api/reservations?date=${encodeURIComponent(date)}`);
    },
    listReservationsByOwner(ownerId: string) {
      return request<GingrReservation[]>(
        `/api/reservations?owner_id=${encodeURIComponent(ownerId)}`
      );
    }
  };
}

export type GingrClient = ReturnType<typeof createGingrClient>;
