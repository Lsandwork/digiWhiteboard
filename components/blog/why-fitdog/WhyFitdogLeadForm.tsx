"use client";

import { useMemo, useState } from "react";
import { WHY_FITDOG_LEAD_SERVICES } from "@/lib/blog/why-fitdog/content";

export function WhyFitdogLeadForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [nextLabel, setNextLabel] = useState<string | null>(null);

  const attribution = useMemo(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") || "",
      utmMedium: params.get("utm_medium") || "",
      utmCampaign: params.get("utm_campaign") || "",
      referrer: document.referrer || ""
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setNextUrl(null);
    setNextLabel(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      ownerFirstName: String(form.get("ownerFirstName") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      dogName: String(form.get("dogName") || ""),
      dogAgeRange: String(form.get("dogAgeRange") || ""),
      primaryGoal: String(form.get("primaryGoal") || ""),
      serviceInterest: String(form.get("serviceInterest") || ""),
      preferredContact: String(form.get("preferredContact") || ""),
      message: String(form.get("message") || ""),
      consent: form.get("consent") === "on",
      website: String(form.get("website") || ""),
      ...attribution
    };

    try {
      const res = await fetch("/api/blog/public/why-fitdog-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        nextStep?: { label: string; url: string } | null;
      };
      if (!res.ok) {
        setStatus("err");
        setMessage(json.error || "Something went wrong. Please try again or call Fitdog.");
        return;
      }
      setStatus("ok");
      setMessage(json.message || "Thanks — we’ll be in touch.");
      if (json.nextStep?.url) {
        setNextUrl(json.nextStep.url);
        setNextLabel(json.nextStep.label);
      }
      event.currentTarget.reset();
    } catch {
      setStatus("err");
      setMessage("Network error. Please try again or call (310) 828-3647.");
    }
  }

  return (
    <form className="wf-form" onSubmit={onSubmit} noValidate>
      <div className="wf-hp" aria-hidden>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="wf-form__grid wf-form__grid--2">
        <div className="wf-field">
          <label htmlFor="wf-owner">Owner first name *</label>
          <input id="wf-owner" name="ownerFirstName" required maxLength={80} autoComplete="given-name" />
        </div>
        <div className="wf-field">
          <label htmlFor="wf-email">Email *</label>
          <input id="wf-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="wf-field">
          <label htmlFor="wf-phone">Phone (optional)</label>
          <input id="wf-phone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="wf-field">
          <label htmlFor="wf-dog">Dog’s name *</label>
          <input id="wf-dog" name="dogName" required maxLength={80} />
        </div>
        <div className="wf-field">
          <label htmlFor="wf-age">Dog’s age range</label>
          <select id="wf-age" name="dogAgeRange" defaultValue="">
            <option value="">Select…</option>
            <option value="puppy">Puppy (under 1)</option>
            <option value="young">1–3 years</option>
            <option value="adult">4–8 years</option>
            <option value="senior">9+ years</option>
          </select>
        </div>
        <div className="wf-field">
          <label htmlFor="wf-contact">Preferred contact</label>
          <select id="wf-contact" name="preferredContact" defaultValue="email">
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="either">Either</option>
          </select>
        </div>
        <div className="wf-field">
          <label htmlFor="wf-interest">Service of interest *</label>
          <select id="wf-interest" name="serviceInterest" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {WHY_FITDOG_LEAD_SERVICES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="wf-field">
          <label htmlFor="wf-goal">Primary goal</label>
          <input id="wf-goal" name="primaryGoal" maxLength={120} placeholder="e.g. daycare while at work" />
        </div>
      </div>
      <div className="wf-field" style={{ marginTop: "0.85rem" }}>
        <label htmlFor="wf-message">Optional message</label>
        <textarea id="wf-message" name="message" maxLength={1000} />
      </div>
      <label className="wf-consent">
        <input name="consent" type="checkbox" required />
        <span>I agree Fitdog may contact me about services in Santa Monica, CA. I can unsubscribe or opt out anytime.</span>
      </label>
      <button type="submit" className="wf-btn wf-btn--primary wf-btn--block" style={{ marginTop: "1rem" }} disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : "Talk to the Fitdog Team"}
      </button>
      {message ? (
        <p className={`wf-form__status ${status === "ok" ? "wf-form__status--ok" : status === "err" ? "wf-form__status--err" : ""}`} role="status">
          {message}
        </p>
      ) : null}
      {nextUrl && nextLabel ? (
        <a href={nextUrl} className="wf-btn wf-btn--secondary wf-btn--block" style={{ marginTop: "0.75rem" }} target="_blank" rel="noopener noreferrer">
          {nextLabel}
        </a>
      ) : null}
    </form>
  );
}
