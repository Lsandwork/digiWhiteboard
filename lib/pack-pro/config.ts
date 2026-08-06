import { PACK_PRO_BASE_URL, PACK_PRO_GROUP_ID_DEFAULT } from "@/lib/pack-pro/courses";

export function packProEmail(): string | null {
  return process.env.PACK_PRO_EMAIL?.trim() || null;
}

export function packProPassword(): string | null {
  return process.env.PACK_PRO_PASSWORD || null;
}

export function packProBaseUrl(): string {
  return (process.env.PACK_PRO_BASE_URL?.trim() || PACK_PRO_BASE_URL).replace(/\/$/, "");
}

export function packProGroupId(): number {
  const raw = Number(process.env.PACK_PRO_GROUP_ID ?? PACK_PRO_GROUP_ID_DEFAULT);
  if (!Number.isFinite(raw) || raw < 1) return PACK_PRO_GROUP_ID_DEFAULT;
  return Math.round(raw);
}

export function packProSyncEnabled(): boolean {
  const raw = process.env.PACK_PRO_SYNC_ENABLED;
  if (raw == null || raw === "") return true;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

export function packProCredentialsConfigured(): boolean {
  return Boolean(packProEmail() && packProPassword());
}
