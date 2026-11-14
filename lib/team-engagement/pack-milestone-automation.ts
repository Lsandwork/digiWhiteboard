import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseEngagementDb } from "@/lib/team-engagement/db";
import { loadEngagementDirectory } from "@/lib/team-engagement/directory";
import { mapDbError, isMissingRelationError } from "@/lib/team-engagement/errors";
import { syncPackMilestonesCore, type StaffHrRow } from "@/lib/team-engagement/pack-features";

export async function loadStaffHrForCron(supabase: SupabaseClient): Promise<StaffHrRow[]> {
  const { data, error } = await supabase
    .from("staff_directory")
    .select("admin_user_id, name, hire_date, birthday_month, birthday_day, show_birthday");
  if (error) {
    if (isMissingRelationError(error) || error.message?.includes("hire_date")) return [];
    throw mapDbError(error);
  }
  return (data ?? []) as StaffHrRow[];
}

/** Idempotent milestone generation for cron and manual leadership sync. */
export async function runPackMilestoneAutomation(supabase: SupabaseClient) {
  const db = createSupabaseEngagementDb(supabase);
  const directory = await loadEngagementDirectory(supabase);
  const staff = await loadStaffHrForCron(supabase);
  const generated = await syncPackMilestonesCore({ db, staff, directory });
  return { generated, staffWithHireDates: staff.filter((row) => row.admin_user_id && row.hire_date).length };
}