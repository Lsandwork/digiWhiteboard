import { isAdminRequest } from "@/lib/admin/api-auth";

export function isLobbyAdmin(request: Request) {
  return isAdminRequest(request);
}

export function getLobbyDisplayToken() {
  return process.env.LOBBY_DISPLAY_TOKEN?.trim() || null;
}

export function isLobbyDisplayAuthorized(request: Request) {
  const requiredToken = getLobbyDisplayToken();
  if (!requiredToken) return true;

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  const headerToken = request.headers.get("x-lobby-display-token")?.trim();

  return queryToken === requiredToken || headerToken === requiredToken;
}

export function unauthorizedLobbyResponse(body: Record<string, unknown> = { error: "Unauthorized." }) {
  return Response.json(body, { status: 401 });
}
