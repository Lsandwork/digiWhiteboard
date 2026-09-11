import {
  canAccessCardStudio,
  canDeleteCardStudioTemplates,
  canManageCardStudioPrinters,
  canManageCardStudioSettings,
  hasPermission,
  type PermissionKey,
  type UserAccess
} from "@/lib/admin/permissions";
import { isAdminRequest, getEffectiveAdminRole, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole } from "@/lib/admin/permissions";
import { resolveSessionAccess } from "@/lib/admin/resolve-user-access";

export const CARD_STUDIO_PERMISSIONS = [
  "card_studio.view",
  "card_studio.design",
  "card_studio.issue",
  "card_studio.print",
  "card_studio.manage_assets",
  "card_studio.delete_templates",
  "card_studio.manage_printers",
  "card_studio.manage_settings",
  "card_studio.revoke"
] as const satisfies readonly PermissionKey[];

export type CardStudioPermission = (typeof CARD_STUDIO_PERMISSIONS)[number];

export type CardStudioAuth = {
  session: ReturnType<typeof getAdminSessionFromRequest>;
  role: string | null;
  access: UserAccess | null;
};

function forbidden(message: string) {
  return Response.json({ error: message, code: "CARD_STUDIO_FORBIDDEN" }, { status: 403 });
}

export async function requireCardStudioPermission(request: Request, permission: CardStudioPermission) {
  if (!isAdminRequest(request)) {
    return { ok: false as const, response: unauthorizedAdminResponse() };
  }

  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);
  const access = session ? await resolveSessionAccess(session) : accessFromLegacyRole(null, null, role);

  if (!canAccessCardStudio(access, role)) {
    return {
      ok: false as const,
      response: forbidden("Card Studio is limited to Admin and Marketing accounts.")
    };
  }

  const roleDefaults = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, role);
  if (!hasPermission(access, permission) && !hasPermission(roleDefaults, permission)) {
    if (permission === "card_studio.manage_printers" && !canManageCardStudioPrinters(access, role)) {
      return { ok: false as const, response: forbidden("Printer administration is limited to Admin.") };
    }
    if (permission === "card_studio.manage_settings" && !canManageCardStudioSettings(access, role)) {
      return { ok: false as const, response: forbidden("Card Studio system settings are limited to Admin.") };
    }
    if (permission === "card_studio.delete_templates" && !canDeleteCardStudioTemplates(access, role)) {
      return { ok: false as const, response: forbidden("Only Admin can delete card templates.") };
    }
    return {
      ok: false as const,
      response: forbidden("You do not have permission for this Card Studio action.")
    };
  }

  return { ok: true as const, session, role, access };
}

export function cardStudioActor(session: { email?: string | null; adminUserId?: string | null } | null, role?: string | null) {
  return {
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    role: role ?? null
  };
}
