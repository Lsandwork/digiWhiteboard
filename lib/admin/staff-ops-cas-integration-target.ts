/**
 * Guards Staff Ops CAS integration tests so they never mutate an unidentified database.
 *
 * Required:
 *   STAFF_OPS_CAS_INTEGRATION=1
 *
 * Allowed targets (pick one):
 *   - Local Supabase: hostname localhost or 127.0.0.1 (default when unset)
 *   - Staging: set STAFF_OPS_CAS_INTEGRATION_HOST to the exact Supabase project hostname
 */

export type StaffOpsCasIntegrationGate =
  | { ok: true; host: string; mode: "local" | "explicit-host" }
  | { ok: false; host: string; reason: string };

export function gateStaffOpsCasIntegration(): StaffOpsCasIntegrationGate {
  if (process.env.STAFF_OPS_CAS_INTEGRATION !== "1") {
    return { ok: false, host: "", reason: "Set STAFF_OPS_CAS_INTEGRATION=1 to run PostgreSQL CAS integration tests." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return { ok: false, host: "", reason: "NEXT_PUBLIC_SUPABASE_URL is not configured." };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, host: "", reason: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  }

  const explicit = process.env.STAFF_OPS_CAS_INTEGRATION_HOST?.trim();
  if (explicit) {
    if (host !== explicit) {
      return {
        ok: false,
        host,
        reason: `Supabase host "${host}" does not match STAFF_OPS_CAS_INTEGRATION_HOST="${explicit}".`
      };
    }
    return { ok: true, host, mode: "explicit-host" };
  }

  if (host === "localhost" || host === "127.0.0.1") {
    return { ok: true, host, mode: "local" };
  }

  return {
    ok: false,
    host,
    reason: `Refusing CAS integration tests against "${host}" without STAFF_OPS_CAS_INTEGRATION_HOST (use local Supabase or explicitly allow staging).`
  };
}
