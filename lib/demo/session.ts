import type { AdminSession } from "@/lib/admin/session";
import { findDemoAccount, isDemoEmail, isInvestorDemoEmail } from "@/lib/demo/constants";

export function isDemoSession(session: AdminSession | null | undefined) {
  if (session?.isDemo === true) return true;
  return isDemoEmail(session?.email);
}

export function getEffectiveDemoRole(session: AdminSession | null | undefined) {
  if (!session) return "viewer";
  if (isDemoSession(session)) return session.demoRole ?? session.role ?? "owner_admin";
  return session.role ?? "viewer";
}

export function usesDemoRoleSwitcher(session: AdminSession | null | undefined) {
  return isDemoSession(session) && isInvestorDemoEmail(session?.email);
}

export function demoWriteBlockedMessage() {
  return "Demo mode — this change is preview-only and was not saved.";
}

export function demoAccountForSession(session: AdminSession | null | undefined) {
  if (!session?.email) return null;
  return findDemoAccount(session.email);
}
