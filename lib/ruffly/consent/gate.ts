import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/ruffly/consent/normalize";
import { isWithinQuietHours } from "@/lib/ruffly/consent/quiet-hours";

export async function canSendToContact(input: {
  contactId: string;
  channel: "sms" | "email";
  purpose: "transactional" | "marketing";
  /** When true, also block automated marketing during configured quiet hours. */
  respectQuietHours?: boolean;
}): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = getServiceSupabase();
  const { data: contact } = await supabase
    .from("ruffly_contacts")
    .select("id, phone_normalized, email_normalized")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact) return { allowed: false, reason: "Contact not found." };

  const phone = contact.phone_normalized;
  const email = contact.email_normalized;

  if (input.channel === "sms" && !phone) {
    return { allowed: false, reason: "Contact has no phone number." };
  }
  if (input.channel === "email" && !email) {
    return { allowed: false, reason: "Contact has no email address." };
  }

  // Filter by identity so STOP'd contacts are never missed by an unscoped row limit.
  let suppressionQuery = supabase
    .from("ruffly_suppressions")
    .select("id, reason, channel, purpose, phone_normalized, email_normalized, contact_id");

  if (input.channel === "sms" && phone) {
    suppressionQuery = suppressionQuery.or(`phone_normalized.eq.${phone},contact_id.eq.${input.contactId}`);
  } else if (input.channel === "email" && email) {
    suppressionQuery = suppressionQuery.or(`email_normalized.eq.${email},contact_id.eq.${input.contactId}`);
  } else {
    suppressionQuery = suppressionQuery.eq("contact_id", input.contactId);
  }

  const { data: suppressions } = await suppressionQuery.limit(50);

  const blocked = (suppressions || []).some((row) => {
    const channelMatch = row.channel === input.channel || row.channel === "all";
    const purposeMatch = row.purpose === input.purpose || row.purpose === "all";
    const identityMatch =
      row.contact_id === input.contactId ||
      (input.channel === "sms" && phone && row.phone_normalized === phone) ||
      (input.channel === "email" && email && row.email_normalized === email);
    return channelMatch && purposeMatch && identityMatch;
  });
  if (blocked) return { allowed: false, reason: "Contact is suppressed." };

  const { data: consent } = await supabase
    .from("ruffly_consents")
    .select("status")
    .eq("contact_id", input.contactId)
    .eq("channel", input.channel)
    .eq("purpose", input.purpose)
    .maybeSingle();

  if (input.purpose === "marketing") {
    if (!consent || consent.status !== "opted_in") {
      return { allowed: false, reason: "Marketing consent not granted." };
    }
  }
  if (consent?.status === "opted_out") {
    return { allowed: false, reason: "Contact opted out." };
  }

  const checkQuiet =
    input.respectQuietHours === true ||
    (input.respectQuietHours !== false && input.purpose === "marketing");
  if (checkQuiet) {
    const { data: settings } = await supabase
      .from("ruffly_settings")
      .select("quiet_hours")
      .eq("id", "default")
      .maybeSingle();
    if (isWithinQuietHours(settings?.quiet_hours as { start?: string; end?: string; timezone?: string } | null)) {
      return { allowed: false, reason: "Quiet hours are active." };
    }
  }

  return { allowed: true };
}

/** STOP / natural-language opt-out suppresses all SMS purposes. */
export async function applySmsOptOut(input: {
  contactId?: string | null;
  phone?: string | null;
  source: string;
  rawBody: string;
}) {
  const supabase = getServiceSupabase();
  const phoneNormalized = normalizePhone(input.phone);
  const now = new Date().toISOString();

  if (input.contactId) {
    for (const purpose of ["marketing", "transactional"] as const) {
      await supabase.from("ruffly_consents").upsert(
        {
          contact_id: input.contactId,
          channel: "sms",
          purpose,
          status: "opted_out",
          source: input.source,
          opted_out_at: now,
          updated_at: now
        },
        { onConflict: "contact_id,channel,purpose" }
      );
    }
  }

  await supabase.from("ruffly_suppressions").insert({
    contact_id: input.contactId ?? null,
    phone_normalized: phoneNormalized,
    channel: "sms",
    purpose: "all",
    reason: "customer_opt_out",
    source: input.source
  });
}
