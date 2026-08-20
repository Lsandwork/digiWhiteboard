/**
 * Low-level Gingr legacy v1 reads for Package Group Walks.
 * Never include the request URL in errors — Gingr query strings contain `key=`.
 */
import { createGingrClient, unwrapGingrData } from "@/lib/integrations/gingr/client";
import { requireTlGingrApiKey, tlGingrClientConfig } from "@/lib/tl-digi-board/gingr-auth";
import { fetchTlGingrResponse } from "@/lib/tl-digi-board/gingr-http";

const DEFAULT_TIMEOUT_MS = 8_000;

export type GingrV1Read = {
  ok: boolean;
  status: number | null;
  payload: unknown;
  error: string | null;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function gingrClient() {
  const apiKey = requireTlGingrApiKey();
  const { subdomain, locationId } = tlGingrClientConfig();
  return createGingrClient({ apiKey, subdomain, locationId });
}

/** Pull a list out of Gingr's various `{ data }` / keyed-object envelopes. */
export function gingrRowsFromPayload(payload: unknown): Array<Record<string, unknown>> {
  let data: unknown = payload;
  try {
    data = unwrapGingrData(payload);
  } catch {
    data = payload;
  }

  if (Array.isArray(data)) {
    return data.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
  }

  const record = asRecord(data);
  if (!record) return [];

  for (const key of [
    "subscriptions",
    "packages",
    "items",
    "rows",
    "owners",
    "animals",
    "types",
    "retail_items",
    "invoices",
    "credits"
  ]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
    }
  }

  return Object.values(record)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

export function payloadShape(payload: unknown): { dataKind: string; topLevelKeys: string[]; rowCount: number } {
  if (payload == null) return { dataKind: "null", topLevelKeys: [], rowCount: 0 };
  if (Array.isArray(payload)) {
    return { dataKind: "array", topLevelKeys: [], rowCount: payload.length };
  }
  const record = asRecord(payload);
  if (!record) return { dataKind: typeof payload, topLevelKeys: [], rowCount: 0 };
  const keys = Object.keys(record)
    .filter((key) => !/^(?:key|api_key|token|password|authorization)$/i.test(key))
    .sort();
  return {
    dataKind: "object",
    topLevelKeys: keys,
    rowCount: gingrRowsFromPayload(payload).length
  };
}

export async function gingrV1Request(options: {
  path: string;
  method?: "GET" | "POST";
  params?: Record<string, string>;
  timeoutMs?: number;
  label: string;
}): Promise<GingrV1Read> {
  const method = options.method ?? "GET";
  const params = options.params ?? {};
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const client = gingrClient();
    const fields = new URLSearchParams({ key: client.config.apiKey, ...params });
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const url =
      method === "GET"
        ? `${client.config.baseUrl}${path}?${fields.toString()}`
        : `${client.config.baseUrl}${path}`;

    const response = await fetchTlGingrResponse(
      url,
      method === "GET"
        ? { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" }
        : {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            },
            body: fields,
            cache: "no-store"
          },
      options.label,
      timeoutMs
    );
    const status = response.status;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        status,
        payload: null,
        error: `${options.label} HTTP ${status}: ${text.slice(0, 120) || response.statusText}`
      };
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    return { ok: true, status, payload, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      payload: null,
      error: error instanceof Error ? error.message : `${options.label} failed.`
    };
  }
}
