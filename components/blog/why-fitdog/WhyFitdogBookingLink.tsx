"use client";

import { useCallback } from "react";
import {
  analyticsEventForAction,
  getFitdogBookingActions,
  type FitdogBookingAction
} from "@/lib/blog/booking-config";

type Props = {
  action: FitdogBookingAction;
  label?: string;
  className?: string;
  ctaLocation: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dark";
};

export function WhyFitdogBookingLink({
  action,
  label,
  className,
  ctaLocation,
  children,
  variant = "primary"
}: Props) {
  const actions = getFitdogBookingActions();
  const entry = actions[action];
  const analytics = analyticsEventForAction(action);

  const onClick = useCallback(() => {
    void fetch("/api/blog/public/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: analytics.event,
        slug: "why-fitdog",
        meta: {
          source: "why_fitdog",
          cta_location: ctaLocation,
          service_interest: analytics.serviceInterest,
          destination_type: analytics.destinationType,
          destination: entry.destinationType === "training_consult" ? "training_consult_calendly" : entry.destinationType
        }
      })
    }).catch(() => undefined);
  }, [analytics, ctaLocation, entry.destinationType]);

  if (!entry.available || !entry.url) {
    return (
      <span className={`wf-btn wf-btn--disabled ${className || ""}`} aria-disabled="true">
        {label || entry.label} (unavailable)
      </span>
    );
  }

  const variantClass =
    variant === "secondary"
      ? "wf-btn wf-btn--secondary"
      : variant === "ghost"
        ? "wf-btn wf-btn--ghost"
        : variant === "dark"
          ? "wf-btn wf-btn--dark"
          : "wf-btn wf-btn--primary";

  return (
    <a
      href={entry.url}
      className={`${variantClass} ${className || ""}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      data-cta-action={action}
      data-service-interest={analytics.serviceInterest}
    >
      {children || label || entry.label}
    </a>
  );
}
