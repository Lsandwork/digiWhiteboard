import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin/auth";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import {
  dispatchPersonalStaffEmailNotification,
  dispatchStaffOpsNotificationEvent
} from "@/lib/staff/admin-ops";

const BLOG_NEWSLETTER_ALERT_EMAIL =
  process.env.BLOG_NEWSLETTER_ALERT_EMAIL?.trim().toLowerCase() || SUPER_ADMIN_EMAIL;

/** Staff-dashboard + email alerts when someone subscribes to the public blog newsletter. */
export async function notifySuperAdminOfBlogSubscriber(input: {
  supabase: SupabaseClient | null;
  subscriberEmail: string;
  duplicate?: boolean;
}) {
  const subscriberEmail = input.subscriberEmail.trim().toLowerCase();
  const title = input.duplicate
    ? "Blog newsletter subscriber reactivated"
    : "New blog newsletter subscriber";
  const body = input.duplicate
    ? `${subscriberEmail} re-subscribed (or reactivated) on the public Fitdog blog tips list.`
    : `${subscriberEmail} subscribed to the public Fitdog blog tips list.`;
  const sourceId = `blog-newsletter:${subscriberEmail}:${Date.now()}`;

  let dashboardNotified = false;
  if (input.supabase) {
    try {
      await dispatchStaffOpsNotificationEvent(input.supabase, {
        eventType: "created",
        sourceTable: "blog_subscribers",
        sourceId,
        sourceTab: "notifications",
        title,
        body,
        priority: "High",
        urgent: false,
        needsManagementReview: true,
        actor: "blog_public"
      });
      await dispatchPersonalStaffEmailNotification(
        input.supabase,
        {
          eventType: "created",
          sourceTable: "blog_subscribers",
          sourceId,
          sourceTab: "notifications",
          title,
          body,
          priority: "High",
          urgent: false,
          needsManagementReview: true,
          actor: "blog_public"
        },
        BLOG_NEWSLETTER_ALERT_EMAIL
      );
      dashboardNotified = true;
    } catch {
      dashboardNotified = false;
    }
  }

  let emailed = false;
  const provider = getEmailProvider();
  if (provider.isConfigured()) {
    const result = await provider.send({
      to: BLOG_NEWSLETTER_ALERT_EMAIL,
      purpose: "transactional",
      subject: `[Fitdog Blog] ${title}`,
      html: `<p><strong>${title}</strong></p><p>${body}</p><p>Open the staff dashboard Notifications panel to review.</p>`,
      text: `${title}\n\n${body}\n\nOpen the staff dashboard Notifications panel to review.`
    });
    emailed = result.ok;
  }

  return {
    alertEmail: BLOG_NEWSLETTER_ALERT_EMAIL,
    dashboardNotified,
    emailed
  };
}
