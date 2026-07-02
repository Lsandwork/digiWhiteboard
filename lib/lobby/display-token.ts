export function getLobbyEmbeddedDisplayToken() {
  return process.env.LOBBY_DISPLAY_TOKEN?.trim() || undefined;
}
