export async function readApiJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    if (!response.ok) {
      throw new Error(response.status === 413 ? "File is too large for server upload. Try again after the page reloads." : `Request failed (${response.status}).`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const preview = raw.slice(0, 120).trim();
    if (/request entity too large/i.test(raw) || response.status === 413) {
      throw new Error("Video is too large to upload through the app server. Use a smaller file or try again in a moment.");
    }
    throw new Error(preview || `Request failed (${response.status}).`);
  }
}
