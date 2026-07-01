export function isLobbyAdmin(request: Request) {
  return Boolean(process.env.ADMIN_PASSWORD) && request.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
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

export function unauthorizedLobbyResponse() {
  return Response.json({ error: "Unauthorized." }, { status: 401 });
}
