import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  bookingActionForInterest,
  getFitdogBookingActions,
  type FitdogServiceInterest
} from "@/lib/blog/booking-config";
import { WHY_FITDOG_LEAD_SERVICES } from "@/lib/blog/why-fitdog/content";

export const dynamic = "force-dynamic";

const recentByIp = new Map<string, number>();
const ALLOWED_INTERESTS = new Set(WHY_FITDOG_LEAD_SERVICES.map((s) => s.value));

function rateLimited(ip: string) {
  const now = Date.now();
  const last = recentByIp.get(ip) || 0;
  if (now - last < 20_000) return true;
  recentByIp.set(ip, now);
  return false;
}

function hashIp(ip: string) {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const ownerFirstName = String(body.ownerFirstName || "").trim();
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const phone = String(body.phone || "").trim() || null;
  const dogName = String(body.dogName || "").trim();
  const dogAgeRange = String(body.dogAgeRange || "").trim() || null;
  const primaryGoal = String(body.primaryGoal || "").trim() || null;
  const serviceInterest = String(body.serviceInterest || "").trim() as FitdogServiceInterest;
  const preferredContact = String(body.preferredContact || "").trim() || null;
  const message = String(body.message || "").trim() || null;
  const consent = Boolean(body.consent);

  if (!ownerFirstName || ownerFirstName.length > 80) {
    return NextResponse.json({ error: "Enter your first name." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!dogName || dogName.length > 80) {
    return NextResponse.json({ error: "Enter your dog’s name." }, { status: 400 });
  }
  if (!ALLOWED_INTERESTS.has(serviceInterest)) {
    return NextResponse.json({ error: "Select a service of interest." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "Consent is required so we can contact you." }, { status: 400 });
  }

  let stored = false;
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("blog_why_fitdog_leads").insert({
      owner_first_name: ownerFirstName,
      email,
      phone,
      dog_name: dogName,
      dog_age_range: dogAgeRange,
      primary_goal: primaryGoal,
      service_interest: serviceInterest,
      preferred_contact: preferredContact,
      message,
      consent_at: new Date().toISOString(),
      source: "why_fitdog",
      utm_source: String(body.utmSource || "").trim() || null,
      utm_medium: String(body.utmMedium || "").trim() || null,
      utm_campaign: String(body.utmCampaign || "").trim() || null,
      referrer: String(body.referrer || "").trim() || null,
      ip_hash: hashIp(ip),
      status: "new"
    });
    if (error) throw error;
    stored = true;
  } catch {
    stored = false;
  }

  await writeBlogAudit(null, "public.why_fitdog_lead", "lead", email, {
    serviceInterest,
    stored,
    dogName
  });

  const action = bookingActionForInterest(serviceInterest);
  const booking = getFitdogBookingActions()[action];

  return NextResponse.json({
    ok: true,
    stored,
    message: stored
      ? "Thanks — our Santa Monica team will follow up using your preferred contact method."
      : "Thanks — we received your request. If you need a faster response, call or email Fitdog directly.",
    nextStep:
      serviceInterest === "sports_enrichment_outing" || serviceInterest === "training"
        ? {
            label:
              serviceInterest === "sports_enrichment_outing"
                ? "Schedule an outing consultation"
                : "Schedule a training consultation",
            url: booking.url,
            serviceInterest
          }
        : serviceInterest === "daycare"
          ? { label: "Book a daycare assessment", url: booking.url, serviceInterest }
          : null
  });
}
