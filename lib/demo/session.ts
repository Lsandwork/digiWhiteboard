import type { AdminSession } from "@/lib/admin/session";
import { DEMO_EMAIL } from "@/lib/demo/constants";

export function isDemoSession(session: AdminSession | null | undefined) {
  return session?.isDemo === true || session?.email?.trim().toLowerCase() === DEMO_EMAIL;
}

export function getEffectiveDemoRole(session: AdminSession | null | undefined) {
  if (!session) return "viewer";
  if (isDemoSession(session)) return session.demoRole ?? session.role ?? "owner_admin";
  return session.role ?? "viewer";
}

export function demoWriteBlockedMessage() {
  return "Demo mode — this change is preview-only and was not saved.";
}
