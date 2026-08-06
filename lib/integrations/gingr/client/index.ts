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

/** Unwrap Gingr `{ error, data }` payloads where `data` may be an array or id-keyed object. */
export function unwrapGingrData<T = unknown>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload) {
    const wrapped = payload as { error?: unknown; data?: unknown };
    if (wrapped.error && wrapped.error !== false) {
      throw new GingrIntegrationError(
        typeof wrapped.error === "string" ? wrapped.error : "Gingr API returned an error.",
        "gingr_api_error"
      );
    }
    return wrapped.data as T;
  }
  return payload as T;
}

/** Normalize reservation list responses (array or `{ [id]: reservation }`). */
export function normalizeGingrReservationList(payload: unknown): GingrReservation[] {
  const data = unwrapGingrData(payload);
  if (Array.isArray(data)) return data as GingrReservation[];
  if (data && typeof data === "object") {
    return Object.values(data as Record<string, GingrReservation>);
  }
  return [];
}

export function createGingrClient(overrides?: GingrClientConfig) {
  const config = resolveConfig(overrides);

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    if (!config.apiKey) {
      throw new GingrAuthError("GINGR_API_KEY is not configured.");
    }
    const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
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

  /** Gingr's documented v1 endpoints expect form-urlencoded POST/GET with `key`. */
  async function requestForm<T>(
    path: string,
    fields: Record<string, string>,
    method: "GET" | "POST" = "POST"
  ): Promise<T> {
    if (!config.apiKey) {
      throw new GingrAuthError("GINGR_API_KEY is not configured.");
    }
    const body = new URLSearchParams({ key: config.apiKey, ...fields });
    if (method === "GET") {
      const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}?${body.toString()}`;
      return requestJson<T>(url.replace(config.baseUrl, ""), { method: "GET" });
    }
    return requestJson<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: body.toString()
    });
  }

  return {
    config,
    async testConnection() {
      try {
        await requestForm(`/api/v1/reservation_types`, {}, "GET");
        return { ok: true as const, message: "Gingr API reachable." };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gingr connection failed.";
        return { ok: false as const, message };
      }
    },
    getOwner(ownerId: string) {
      return requestForm<GingrOwner>(`/api/v1/owner`, { id: ownerId }, "GET");
    },
    listOwners(_params?: { modified_since?: string; limit?: number }) {
      // Legacy helper — prefer reservations / owner endpoints for Fitdog.
      return Promise.resolve([] as GingrOwner[]);
    },
    getAnimal(animalId: string) {
      return requestForm<GingrAnimal>(`/api/v1/animals`, { id: animalId }, "GET");
    },
    /**
     * Official Gingr endpoint:
     * POST /api/v1/reservations with key + start_date + end_date (or checked_in=true).
     */
    async listReservationsByDate(date: string) {
      const payload = await requestForm<unknown>(`/api/v1/reservations`, {
        start_date: date,
        end_date: date,
        location_id: config.locationId,
        checked_in: "false"
      });
      return normalizeGingrReservationList(payload);
    },
    async listReservationsByOwner(ownerId: string) {
      const payload = await requestForm<unknown>(
        `/api/v1/reservations_by_owner`,
        { owner_id: ownerId },
        "GET"
      );
      return normalizeGingrReservationList(payload);
    }
  };
}

export type GingrClient = ReturnType<typeof createGingrClient>;
