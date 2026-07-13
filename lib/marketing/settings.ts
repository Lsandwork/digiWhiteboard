type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function getMarketingUserSettings(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("marketing_user_settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (
    data ?? {
      user_id: userId,
      default_destination: "photo_box",
      default_upload_tags: [],
      thumbnail_density: "comfortable",
      notify_handler_updates: true,
      notify_upload_results: true,
      notify_campaign_deadlines: true
    }
  );
}

export async function saveMarketingUserSettings(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from("marketing_user_settings")
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
