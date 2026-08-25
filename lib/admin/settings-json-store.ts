import { invalidateTtlCache } from "@/lib/server-ttl-cache";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export function isMissingAdminSettingsRelation(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache")) ||
    Boolean(error?.message?.includes("Could not query the database"))
  );
}

/** PostgREST alias for `settings->key` is the key name itself. */
function readScopedKey(data: Record<string, unknown> | null | undefined, key: string) {
  if (!data) return undefined;
  if (key in data) return data[key];
  const settings = data.settings;
  if (settings && typeof settings === "object" && key in (settings as Record<string, unknown>)) {
    return (settings as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Read one JSON key from admin_settings without transferring the whole 7+ MiB blob.
 * Every staff/admin feature store should use this instead of `.select("settings")`.
 */
export async function loadAdminSettingsJsonKey<T>(
  supabase: SupabaseClient,
  key: string,
  parse: (value: unknown) => T,
  fallback: T
): Promise<T | null> {
  const { data, error } = await supabase
    .from("admin_settings")
    .select(`settings->${key}`)
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettingsRelation(error)) return null;
    throw error;
  }

  const raw = readScopedKey(data as Record<string, unknown> | null, key);
  if (raw === undefined || raw === null) return fallback;
  return parse(raw);
}

export type AdminSettingsJsonPointer = {
  alias: string;
  /** PostgREST jsonb path after `settings->`, e.g. `staff_admin_ops->active_issues`. */
  path: string;
};

/**
 * Read several JSON pointers from the same admin_settings row in one round trip.
 * Nested paths avoid transferring unused blobs such as 500 crossover messages.
 */
export async function loadAdminSettingsJsonPointers(
  supabase: SupabaseClient,
  pointers: AdminSettingsJsonPointer[]
): Promise<Record<string, unknown> | null> {
  if (!pointers.length) return {};

  const nestedSelect = pointers.map((pointer) => `${pointer.alias}:settings->${pointer.path}`).join(",");
  const nested = await supabase.from("admin_settings").select(nestedSelect).eq("id", "default").maybeSingle();
  if (!nested.error) return (nested.data as Record<string, unknown> | null) ?? {};
  if (isMissingAdminSettingsRelation(nested.error)) return null;

  const topLevelKeys = [...new Set(pointers.map((pointer) => pointer.path.split("->")[0] || pointer.path))];
  const topSelect = topLevelKeys.map((key) => `${key}:settings->${key}`).join(",");
  const top = await supabase.from("admin_settings").select(topSelect).eq("id", "default").maybeSingle();
  if (top.error) {
    if (isMissingAdminSettingsRelation(top.error)) return null;
    throw top.error;
  }

  const row = (top.data as Record<string, unknown> | null) ?? {};
  const out: Record<string, unknown> = {};
  for (const pointer of pointers) {
    const parts = pointer.path.split("->").filter(Boolean);
    let cursor: unknown = parts.length ? row[parts[0]] : undefined;
    for (const part of parts.slice(1)) {
      if (!cursor || typeof cursor !== "object") {
        cursor = undefined;
        break;
      }
      cursor = (cursor as Record<string, unknown>)[part];
    }
    out[pointer.alias] = cursor;
  }
  return out;
}

/**
 * Patch one JSON key via Postgres jsonb_set — no read/modify/write of the full blob.
 * Falls back to read-merge-write when the RPC is not deployed yet.
 */
export async function saveAdminSettingsJsonKey(
  supabase: SupabaseClient,
  key: string,
  value: unknown
): Promise<boolean> {
  const { error: rpcError } = await supabase.rpc("patch_admin_settings_json", {
    p_key: key,
    p_value: value
  });

  if (!rpcError) {
    invalidateTtlCache("settings:");
    invalidateTtlCache("staff-ops:");
    return true;
  }

  if (rpcError.code !== "PGRST202" && !rpcError.message?.includes("patch_admin_settings_json")) {
    if (isMissingAdminSettingsRelation(rpcError)) return false;
    throw rpcError;
  }

  const current = await loadAdminSettingsJsonKey(supabase, key, (raw) => raw, null);
  void current;
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingAdminSettingsRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [key]: value
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) {
    if (isMissingAdminSettingsRelation(saveError)) return false;
    throw saveError;
  }
  invalidateTtlCache("settings:");
  invalidateTtlCache("staff-ops:");
  return true;
}
