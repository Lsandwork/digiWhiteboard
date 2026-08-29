"use client";

import { FormEvent, useMemo, useState } from "react";
import { CircleCheck, Mail, Send, TriangleAlert } from "lucide-react";
import { BUSINESS_TYPES, SERVICE_OPTIONS, SITE } from "@/lib/ruffops-site/config";

const fieldLabel = "mb-1.5 block text-sm font-medium text-slate-300";

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm({
  defaultFormType = "Strategy Call Request"
}: {
  defaultFormType?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const endpoint = useMemo(() => process.env.NEXT_PUBLIC_FORM_ENDPOINT?.trim() || "/api/ruffops-site/send", []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("company") || "").trim()) {
      setStatus("success");
      return;
    }
    setStatus("submitting");
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data
      });
      if (!response.ok && response.status !== 302) {
        throw new Error(`Request failed (${response.status})`);
      }
      form.reset();
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="card flex flex-col items-center gap-4 p-10 text-center">
        <CircleCheck className="h-12 w-12 text-emerald-400" />
        <h3 className="text-xl font-semibold text-white">Thank you. We received your request.</h3>
        <p className="max-w-md text-sm text-slate-400">
          We will review your business details and follow up within one business day. You can also call{" "}
          <a className="text-ro-accent-soft hover:underline" href={SITE.phoneHref}>
            {SITE.phoneDisplay}
          </a>{" "}
          or email {SITE.email}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6 sm:p-8" noValidate>
      <input type="text" name="company" className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <input type="hidden" name="form_type" value={defaultFormType} />
      <div className="flex items-start gap-3 rounded-xl border border-ro-electric/30 bg-ro-electric/5 px-4 py-3 text-sm text-slate-200">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-ro-electric" />
        <span>
          We reply within one business day at {SITE.email} or {SITE.phoneDisplay}. Santa Monica on-site, nationwide online.
        </span>
      </div>
      {status === "error" ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error || "Sorry — something went wrong sending your message."} Please call{" "}
          <a className="underline" href={SITE.phoneHref}>
            {SITE.phoneDisplay}
          </a>
          .
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={fieldLabel}>
            Name
          </label>
          <input id="name" name="name" required className="field-input" placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="business_name" className={fieldLabel}>
            Business name
          </label>
          <input id="business_name" name="business_name" className="field-input" placeholder="Facility name" />
        </div>
        <div>
          <label htmlFor="business_type" className={fieldLabel}>
            Business type
          </label>
          <select id="business_type" name="business_type" className="field-input" defaultValue="">
            <option value="" disabled>
              Select type
            </option>
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="location" className={fieldLabel}>
            Location
          </label>
          <input id="location" name="location" className="field-input" placeholder="City, State" />
        </div>
        <div>
          <label htmlFor="email" className={fieldLabel}>
            Email
          </label>
          <input id="email" name="email" type="email" required className="field-input" placeholder="you@business.com" />
        </div>
        <div>
          <label htmlFor="phone" className={fieldLabel}>
            Phone
          </label>
          <input id="phone" name="phone" type="tel" className="field-input" placeholder="(855) 783-3677" />
        </div>
        <div>
          <label htmlFor="dogs_per_day" className={fieldLabel}>
            Number of dogs per day
          </label>
          <input id="dogs_per_day" name="dogs_per_day" className="field-input" placeholder="e.g. 60" />
        </div>
        <div>
          <label htmlFor="current_software" className={fieldLabel}>
            Current software used
          </label>
          <input id="current_software" name="current_software" className="field-input" placeholder="Gingr, DaySmart, spreadsheets…" />
        </div>
      </div>
      <fieldset>
        <legend className={fieldLabel}>Services offered</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SERVICE_OPTIONS.map((service) => (
            <label key={service} className="flex items-center gap-2 rounded-lg border border-ro-line bg-ro-900/50 px-3 py-2 text-sm text-slate-300">
              <input type="checkbox" name="services_offered" value={service} className="accent-ro-accent" />
              {service}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="challenge" className={fieldLabel}>
          Biggest operational challenge
        </label>
        <textarea
          id="challenge"
          name="biggest_challenge"
          rows={4}
          className="field-input"
          placeholder="Tell us briefly what you'd like help with"
        />
      </div>
      <div>
        <label htmlFor="preferred_contact" className={fieldLabel}>
          Preferred contact method
        </label>
        <select id="preferred_contact" name="preferred_contact" className="field-input" defaultValue="Email">
          <option>Email</option>
          <option>Phone</option>
          <option>Text</option>
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className="btn-primary" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Request My Review"}
          <Send className="h-4 w-4" />
        </button>
        <a className="btn-secondary" href={SITE.phoneHref}>
          Or call {SITE.phoneDisplay}
        </a>
      </div>
    </form>
  );
}

export function ChecklistForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (String(data.get("company") || "").trim()) {
      setStatus("success");
      return;
    }
    setStatus("submitting");
    try {
      const response = await fetch("/api/ruffops-site/send", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data
      });
      if (!response.ok && response.status !== 302) throw new Error("failed");
      form.reset();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-wrap gap-3">
      <input type="text" name="company" className="hp-field" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <input type="hidden" name="form_type" value="Risk Checklist Request" />
      <input type="email" name="email" required className="field-input min-w-[220px] flex-1" placeholder="Enter your email address" aria-label="Email address" />
      <button className="btn-primary" type="submit" disabled={status === "submitting"}>
        {status === "success" ? "Check your inbox" : "Get the Checklist"}
      </button>
      {status === "error" ? (
        <p className="w-full text-sm text-red-300">Could not send. Email {SITE.email} or call {SITE.phoneDisplay}.</p>
      ) : (
        <p className="w-full text-sm text-slate-500">No spam. Unsubscribe anytime.</p>
      )}
    </form>
  );
}
