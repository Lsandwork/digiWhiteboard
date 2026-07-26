import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptFitdogSession, encryptFitdogSession } from "@/lib/fitdog-ops/crypto";

export type MissedCallGmailSettings = {
  gmail_user: string;
  has_app_password: boolean;
  updated_at: string | null;
};

function envPassword(): string {
  return (
    process.env.GMAIL_IMAP_APP_PASSWORD?.trim() ||
    process.env.MISSED_CALLS_GMAIL_APP_PASSWORD?.trim() ||
    process.env.GMAIL_IMAP_PASSWORD?.trim() ||
    ""
  );
}

function envUser(): string {
  return (
    process.env.GMAIL_IMAP_USER?.trim() ||
    process.env.MISSED_CALLS_GMAIL_USER?.trim() ||
    "lonnie@fitdog.com"
  );
}

export async function loadGmailCredentials(supabase: SupabaseClient): Promise<{
  user: string;
  pass: string;
  source: "env" | "database" | "none";
}> {
  const envPass = envPassword();
  if (envPass) {
    return { user: envUser(), pass: envPass, source: "env" };
  }

  const { data, error } = await supabase
    .from("missed_call_gmail_settings")
    .select("gmail_user, app_password_enc")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) {
    return { user: envUser(), pass: "", source: "none" };
  }

  const decrypted = decryptFitdogSession((data.app_password_enc as Record<string, unknown>) || null);
  const pass = typeof decrypted?.app_password === "string" ? decrypted.app_password.trim() : "";
  const user = String(data.gmail_user || "").trim() || envUser();
  return { user, pass, source: pass ? "database" : "none" };
}

export async function getGmailSettingsPublic(supabase: SupabaseClient): Promise<MissedCallGmailSettings> {
  const creds = await loadGmailCredentials(supabase);
  const { data } = await supabase
    .from("missed_call_gmail_settings")
    .select("updated_at")
    .eq("id", "default")
    .maybeSingle();
  return {
    gmail_user: creds.user,
    has_app_password: Boolean(creds.pass),
    updated_at: (data?.updated_at as string | null) ?? null
  };
}

export async function saveGmailAppPassword(
  supabase: SupabaseClient,
  params: { user?: string; appPassword: string; actorUserId?: string | null }
): Promise<MissedCallGmailSettings> {
  const appPassword = params.appPassword.replace(/\s+/g, "").trim();
  if (appPassword.length < 8) {
    throw new Error("App password looks too short. Paste the 16-character Google App Password.");
  }
  const user = (params.user || envUser()).trim() || "lonnie@fitdog.com";
  const envelope = encryptFitdogSession({ app_password: appPassword });
  const { error } = await supabase.from("missed_call_gmail_settings").upsert({
    id: "default",
    gmail_user: user,
    app_password_enc: envelope,
    updated_at: new Date().toISOString(),
    updated_by: params.actorUserId ?? null
  });
  if (error) throw new Error(error.message);
  return {
    gmail_user: user,
    has_app_password: true,
    updated_at: new Date().toISOString()
  };
}
