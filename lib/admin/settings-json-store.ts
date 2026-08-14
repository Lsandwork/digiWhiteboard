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
