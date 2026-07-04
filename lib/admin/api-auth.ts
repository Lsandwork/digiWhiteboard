import { getAdminSessionFromRequest } from "@/lib/admin/session";

export function isAdminRequest(request: Request) {
  if (getAdminSessionFromRequest(request)) return true;

  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  const headerPassword = request.headers.get("x-admin-password")?.trim();
  return Boolean(legacyPassword && headerPassword && headerPassword === legacyPassword);
}

export function unauthorizedAdminResponse(body: Record<string, unknown> = { error: "Unauthorized." }) {
  return Response.json(body, { status: 401 });
}
