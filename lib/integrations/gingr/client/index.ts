import { GingrAuthError, GingrIntegrationError, GingrRateLimitError } from "@/lib/integrations/gingr/errors";
import type { GingrAnimal, GingrOwner, GingrReservation } from "@/lib/integrations/gingr/types";

export type GingrClientConfig = {
  baseUrl?: string;
  apiKey?: string;
  locationId?: string;
  subdomain?: string;
};

type GingrWrapped<T> = {
  success?: boolean;
  error?: unknown;
  data?: T;
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

function sanitizeGingrErrorBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (/<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
    const title = trimmed.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    return title || "HTML error page";
  }
  return trimmed.slice(0, 200);
}

function unwrapGingrBody<T>(body: GingrWrapped<T> | T): T {
  if (body && typeof body === "object" && "data" in (body as GingrWrapped<T>)) {
    const wrapped = body as GingrWrapped<T>;
    if (wrapped.error) {
      const message =
        typeof wrapped.error === "string" ? wrapped.error : "Gingr API returned an error.";
      throw new GingrIntegrationError(message, "gingr_api_error");
    }
    return wrapped.data as T;
  }
  return body as T;
}

function toFormBody(params: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    body.set(key, value);
  }
  return body;
}

export function createGingrClient(overrides?: GingrClientConfig) {
  const config = resolveConfig(overrides);

  async function requestJson<T>(
    path: string,
    options?: {
      method?: "GET" | "POST";
      query?: Record<string, string | undefined>;
      form?: Record<string, string | undefined>;
    }
  ): Promise<T> {
    if (!config.apiKey) {
      throw new GingrAuthError("GINGR_API_KEY is not configured.");
    }

    const method = options?.method || (options?.form ? "POST" : "GET");
    const url = new URL(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    // Gingr public API authenticates with a `key` parameter (query or form), not Bearer headers.
    url.searchParams.set("key", config.apiKey);
    for (const [key, value] of Object.entries(options?.query || {})) {
      if (value == null || value === "") continue;
      url.searchParams.set(key, value);
    }

    const init: RequestInit = {
      method,
      headers: { Accept: "application/json" },
      cache: "no-store"
    };

    if (options?.form) {
      const form = toFormBody({ key: config.apiKey, ...options.form });
      init.headers = {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
      };
      init.body = form;
    }

    const response = await fetch(url.toString(), init);
    if (response.status === 401 || response.status === 403) {
      throw new GingrAuthError();
    }
    if (response.status === 429) {
      throw new GingrRateLimitError();
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new GingrIntegrationError(
        `Gingr API ${response.status}: ${sanitizeGingrErrorBody(text) || response.statusText}`,
        "gingr_http",
        response.status
      );
    }

    const json = (await response.json()) as GingrWrapped<T> | T;
    return unwrapGingrBody(json);
  }

  return {
    config,
    async testConnection() {
      try {
        const locations = await requestJson<unknown[]>("/api/v1/get_locations");
        const count = Array.isArray(locations) ? locations.length : 0;
        return {
          ok: true as const,
          message:
            count > 0
              ? `Gingr API reachable — ${count} location${count === 1 ? "" : "s"} found.`
              : "Gingr API reachable."
        };
      } catch (error) {
        // Proven Digi-board probe used daily by the whiteboard.
        try {
          await requestJson<unknown[]>("/api/v1/reservation_types", {
            query: { active_only: "true" }
          });
          return { ok: true as const, message: "Gingr API reachable (reservation types probe)." };
        } catch (second) {
          const message = second instanceof Error ? second.message : "Gingr connection failed.";
          return { ok: false as const, message };
        }
      }
    },
    getOwner(ownerId: string) {
      return requestJson<GingrOwner>("/api/v1/owner", {
        query: { id: ownerId }
      });
    },
    listOwners(params?: { modified_since?: string; limit?: number }) {
      if (params?.modified_since) {
        const start = params.modified_since.slice(0, 10);
        const end = new Date().toISOString().slice(0, 10);
        return requestJson<GingrOwner[]>("/api/v1/new_modified_owners", {
          method: "POST",
          form: {
            start_date: start,
            end_date: end,
            location_id: config.locationId
          }
        });
      }
      return requestJson<GingrOwner[]>("/api/v1/owners", {
        method: "POST",
        form: params?.limit ? { "params[limit]": String(params.limit) } : undefined
      });
    },
    getAnimal(animalId: string) {
      return requestJson<GingrAnimal>("/api/v1/animals", {
        method: "POST",
        form: { "params[id]": animalId }
      });
    },
    listReservationsByDate(date: string) {
      return requestJson<GingrReservation[]>("/api/v1/reservations", {
        method: "POST",
        form: {
          start_date: date,
          end_date: date,
          location_id: config.locationId
        }
      });
    },
    listReservationsByOwner(ownerId: string) {
      return requestJson<GingrReservation[]>("/api/v1/reservations_by_owner", {
        query: { id: ownerId }
      });
    },
    listLocations() {
      return requestJson<Array<Record<string, unknown>>>("/api/v1/get_locations");
    }
  };
}

export type GingrClient = ReturnType<typeof createGingrClient>;
