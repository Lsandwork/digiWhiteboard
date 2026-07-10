import { getUserAccess } from "@/lib/admin/user-access";
import { hasPermission } from "@/lib/admin/permissions";
import { canReceiveWalkBoardReminders } from "./server";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type WalkBoardReminderRecipient = {
  userId: string;
  email: string;
  displayName: string | null;
};

export async function listWalkBoardReminderRecipients(
  supabase: SupabaseClient
): Promise<WalkBoardReminderRecipient[]> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role, status")
    .eq("status", "active");
  if (error) throw error;

  const recipients = new Map<string, WalkBoardReminderRecipient>();

  for (const user of data ?? []) {
    const email = user.email?.trim().toLowerCase();
    if (!email) continue;

    const access = await getUserAccess(supabase, user.id, user.role, email);
    if (!canReceiveWalkBoardReminders(access) && !hasPermission(access, "receive_walks_board_reminders")) {
      continue;
    }

    recipients.set(email, {
      userId: user.id,
      email,
      displayName: user.full_name ?? null
    });
  }

  return [...recipients.values()];
}
