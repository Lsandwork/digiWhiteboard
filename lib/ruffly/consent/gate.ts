import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/ruffly/consent/normalize";

export async function canSendToContact(input: {
  contactId: string;
  channel: "sms" | "email";
  purpose: "transactional" | "marketing";
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

  let suppressionQuery = supabase.from("ruffly_suppressions").select("id, reason").limit(1);
  if (input.channel === "sms" && phone) {
    suppressionQuery = suppressionQuery.or(
      `and(phone_normalized.eq.${phone},channel.in.(sms,all)),and(phone_normalized.eq.${phone},purpose.in.(${input.purpose},all))`
    );
  } else if (input.channel === "email" && email) {
    suppressionQuery = suppressionQuery.or(
      `and(email_normalized.eq.${email},channel.in.(email,all))`
    );
  }
  const { data: suppressions } = await supabase
    .from("ruffly_suppressions")
    .select("id, reason, channel, purpose, phone_normalized, email_normalized")
    .limit(50);

  const blocked = (suppressions || []).some((row) => {
    const channelMatch = row.channel === input.channel || row.channel === "all";
    const purposeMatch = row.purpose === input.purpose || row.purpose === "all";
    const identityMatch =
      (input.channel === "sms" && phone && row.phone_normalized === phone) ||
      (input.channel === "email" && email && row.email_normalized === email) ||
      false;
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

  return { allowed: true };
}

export async function applySmsOptOut(input: {
  contactId?: string | null;
  phone?: string | null;
  source: string;
  rawBody: string;
}) {
  const supabase = getServiceSupabase();
  const phoneNormalized = normalizePhone(input.phone);
  if (input.contactId) {
    await supabase.from("ruffly_consents").upsert(
      {
        contact_id: input.contactId,
        channel: "sms",
        purpose: "marketing",
        status: "opted_out",
        source: input.source,
        opted_out_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "contact_id,channel,purpose" }
    );
  }
  await supabase.from("ruffly_suppressions").insert({
    contact_id: input.contactId ?? null,
    phone_normalized: phoneNormalized,
    channel: "sms",
    purpose: "marketing",
    reason: "customer_opt_out",
    source: input.source
  });
}
