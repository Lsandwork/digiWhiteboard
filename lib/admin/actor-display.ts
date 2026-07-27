import type { SupabaseClient } from "@supabase/supabase-js";
import { findAdminUserByEmail, getAdminUserById, isAdminUserUuid, listAdminUsers } from "@/lib/admin/users";
import type { AdminSession } from "@/lib/admin/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function looksLikeEmail(value: string | null | undefined): boolean {
  return Boolean(value && EMAIL_RE.test(value.trim()));
}

/** Prefer a real name; never return a raw email when a better label exists. */
export function displayActorLabel(
  value: string | null | undefined,
  lookup?: Map<string, string> | null,
  fallback = "Staff"
): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const key = trimmed.toLowerCase();
  const mapped = lookup?.get(key);
  if (mapped?.trim()) return mapped.trim();

  if (looksLikeEmail(trimmed)) {
    const local = trimmed.split("@")[0]?.replace(/[._]+/g, " ").trim();
    if (local) {
      return local
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }

  return trimmed;
}

export function buildActorNameLookup(
  entries: Array<{ name?: string | null; email?: string | null; id?: string | null; admin_user_id?: string | null }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.name?.trim();
    if (!name || looksLikeEmail(name)) continue;
    if (entry.email?.trim()) map.set(entry.email.trim().toLowerCase(), name);
    if (entry.id?.trim()) map.set(entry.id.trim().toLowerCase(), name);
    if (entry.admin_user_id?.trim()) map.set(entry.admin_user_id.trim().toLowerCase(), name);
  }
  return map;
}

export function resolveDirectoryActorLabel(
  value: string | null | undefined,
  directory?: Array<{ name: string; email?: string | null; admin_user_id?: string | null }> | null,
  fallback = "Staff"
): string {
  if (!value?.trim()) return fallback;
  const lookup = buildActorNameLookup(
    (directory ?? []).map((member) => ({
      name: member.name,
      email: member.email,
      admin_user_id: member.admin_user_id
    }))
  );
  return displayActorLabel(value, lookup, fallback);
}

function nameFromAdminUser(user: { full_name?: string | null; email?: string | null; id?: string | null } | null | undefined) {
  const name = user?.full_name?.trim();
  if (!name || looksLikeEmail(name)) return null;
  return name;
}

/** Resolve the signed-in user's full name from admin_users. */
export async function resolveSessionDisplayName(
  supabase: SupabaseClient,
  session: Pick<AdminSession, "email" | "adminUserId"> | null | undefined
): Promise<string | null> {
  if (!session) return null;

  if (session.adminUserId && isAdminUserUuid(session.adminUserId)) {
    try {
      const name = nameFromAdminUser(await getAdminUserById(supabase, session.adminUserId));
      if (name) return name;
    } catch {
      // fall through to email lookup
    }
  }

  if (session.email?.trim()) {
    try {
      const name = nameFromAdminUser(await findAdminUserByEmail(supabase, session.email));
      if (name) return name;
    } catch {
      // ignore
    }
    return displayActorLabel(session.email);
  }

  return null;
}

/** Batch-resolve emails / admin user ids to display names. */
export async function loadActorNameLookup(
  supabase: SupabaseClient,
  values: Array<string | null | undefined>,
  directory?: Array<{ name: string; email?: string | null; admin_user_id?: string | null }> | null
): Promise<Map<string, string>> {
  const lookup = buildActorNameLookup(
    (directory ?? []).map((member) => ({
      name: member.name,
      email: member.email,
      admin_user_id: member.admin_user_id
    }))
  );

  let needsUsers = false;
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    if (lookup.has(trimmed.toLowerCase())) continue;
    if (looksLikeEmail(trimmed) || isAdminUserUuid(trimmed)) {
      needsUsers = true;
      break;
    }
  }

  if (needsUsers) {
    try {
      const users = await listAdminUsers(supabase);
      for (const user of users) {
        const name = nameFromAdminUser(user);
        if (!name) continue;
        if (user.email?.trim()) lookup.set(user.email.trim().toLowerCase(), name);
        if (user.id?.trim()) lookup.set(user.id.trim().toLowerCase(), name);
      }
    } catch {
      // keep directory-only lookup
    }
  }

  return lookup;
}
