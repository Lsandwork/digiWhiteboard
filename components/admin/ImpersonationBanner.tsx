"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, UserRoundCog } from "lucide-react";

type Impersonator = { email: string; role: string | null } | null;

export function ImpersonationBanner() {
  const [impersonator, setImpersonator] = useState<Impersonator>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!active) return;
        setImpersonator(body.impersonator ?? null);
        setCurrentEmail(body.username ?? null);
      } catch {
        // Non-blocking — banner simply stays hidden on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const returnToAccount = useCallback(async () => {
    setReturning(true);
    try {
      const response = await fetch("/api/admin/impersonate", { method: "DELETE" });
      if (!response.ok) {
        setReturning(false);
        return;
      }
      window.location.assign("/admin");
    } catch {
      setReturning(false);
    }
  }, []);

  if (!impersonator) return null;

  return (
    <div className="impersonation-banner" role="status" aria-live="polite">
      <div className="impersonation-banner__info">
        <UserRoundCog className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          Logged in as <strong>{currentEmail ?? "employee"}</strong>. You are viewing the dashboard as this employee.
        </span>
      </div>
      <button
        type="button"
        className="impersonation-banner__return inline-flex items-center gap-2"
        onClick={() => void returnToAccount()}
        disabled={returning}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {returning ? "Returning…" : `Return to ${impersonator.email}`}
      </button>
    </div>
  );
}
