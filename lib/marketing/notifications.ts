type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function createMarketingNotification(
  supabase: SupabaseClient,
  input: {
    recipientUserId?: string | null;
    recipientRole?: string | null;
    type: string;
    title: string;
    body?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    linkPath?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("marketing_notifications")
    .insert({
      recipient_user_id: input.recipientUserId ?? null,
      recipient_role: input.recipientRole ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      link_path: input.linkPath ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listMarketingNotifications(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  role?: string | null,
  options: { limit?: number; unreadOnly?: boolean } = {}
) {
  const limit = options.limit ?? 50;
  let query = supabase
    .from("marketing_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (userId) {
    query = query.or(`recipient_user_id.eq.${userId},recipient_role.eq.marketing`);
  } else if (role === "marketing") {
    query = query.eq("recipient_role", "marketing");
  }

  if (options.unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function countUnreadMarketingNotifications(
  supabase: SupabaseClient,
  userId?: string | null
) {
  let query = supabase
    .from("marketing_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (userId) {
    query = query.or(`recipient_user_id.eq.${userId},recipient_role.eq.marketing`);
  } else {
    query = query.eq("recipient_role", "marketing");
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markMarketingNotificationRead(supabase: SupabaseClient, id: string, userId?: string | null) {
  let query = supabase
    .from("marketing_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", id);
  if (userId) query = query.or(`recipient_user_id.eq.${userId},recipient_role.eq.marketing`);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function markAllMarketingNotificationsRead(supabase: SupabaseClient, userId?: string | null) {
  let query = supabase
    .from("marketing_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("is_read", false);
  if (userId) query = query.or(`recipient_user_id.eq.${userId},recipient_role.eq.marketing`);
  const { error } = await query;
  if (error) throw new Error(error.message);
}
