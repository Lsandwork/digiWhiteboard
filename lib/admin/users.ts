import bcrypt from "bcryptjs";

export type AdminUserRole = "owner_admin" | "manager_admin" | "viewer";
export type AdminUserStatus = "active" | "disabled";

export type AdminUserRecord = {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  force_password_change: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type AdminUserPublic = Omit<AdminUserRecord, "password_hash">;

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export function sanitizeAdminUser(row: AdminUserRecord): AdminUserPublic {
  const { password_hash: _hash, ...rest } = row;
  return rest;
}

export async function findAdminUserByEmail(supabase: SupabaseClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
  return (data as AdminUserRecord | null) ?? null;
}

export async function listAdminUsers(supabase: SupabaseClient): Promise<AdminUserPublic[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data ?? []) as AdminUserPublic[];
}

export async function getAdminUserById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("admin_users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as AdminUserRecord | null) ?? null;
}

export async function hashAdminPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyAdminUserPassword(user: AdminUserRecord, password: string) {
  return bcrypt.compare(password, user.password_hash);
}

export async function createAdminUser(
  supabase: SupabaseClient,
  input: {
    full_name: string;
    email: string;
    password: string;
    role: AdminUserRole;
    force_password_change?: boolean;
    created_by?: string | null;
  }
) {
  const password_hash = await hashAdminPassword(input.password);
  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      full_name: input.full_name.trim(),
      email: input.email.trim().toLowerCase(),
      password_hash,
      role: input.role,
      force_password_change: input.force_password_change ?? false,
      created_by: input.created_by ?? null
    })
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .single();
  if (error) throw error;
  return data as AdminUserPublic;
}

export async function updateAdminUser(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<AdminUserRecord, "full_name" | "email" | "role" | "status" | "force_password_change">>
) {
  const { data, error } = await supabase
    .from("admin_users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, full_name, email, role, status, force_password_change, last_login_at, created_at, updated_at, created_by")
    .single();
  if (error) throw error;
  return data as AdminUserPublic;
}

export async function changeAdminUserPassword(
  supabase: SupabaseClient,
  id: string,
  password: string,
  forcePasswordChange?: boolean
) {
  const password_hash = await hashAdminPassword(password);
  const { error } = await supabase
    .from("admin_users")
    .update({
      password_hash,
      force_password_change: forcePasswordChange ?? false,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAdminUser(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("admin_users").delete().eq("id", id);
  if (error) throw error;
}

export async function touchAdminUserLogin(supabase: SupabaseClient, id: string) {
  await supabase.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", id);
}
