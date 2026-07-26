export type RufflyFeatureFlag =
  | "RUFFLY_ENABLED"
  | "RUFFLY_WEBCHAT_ENABLED"
  | "RUFFLY_AI_ENABLED"
  | "RUFFLY_VOICE_ENABLED"
  | "RUFFLY_CAMPAIGNS_ENABLED"
  | "RUFFLY_AUTOMATIONS_ENABLED"
  | "RUFFLY_SENDING_SMS_ENABLED"
  | "RUFFLY_SENDING_EMAIL_ENABLED";

function envFlag(name: RufflyFeatureFlag, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isRufflyEnabled() {
  return envFlag("RUFFLY_ENABLED", false);
}

export function isRufflyWebchatEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_WEBCHAT_ENABLED", false);
}

export function isRufflyAiEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_AI_ENABLED", false);
}

export function isRufflyVoiceEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_VOICE_ENABLED", false);
}

export function isRufflyCampaignsEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_CAMPAIGNS_ENABLED", false);
}

export function isRufflyAutomationsEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_AUTOMATIONS_ENABLED", false);
}

export function isRufflySmsSendingEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_SENDING_SMS_ENABLED", false);
}

export function isRufflyEmailSendingEnabled() {
  return isRufflyEnabled() && envFlag("RUFFLY_SENDING_EMAIL_ENABLED", false);
}

/** Direct Gingr reservation writes are not advertised until a tested write path exists. */
export function isRufflyGingrBookingEnabled() {
  return false;
}

export function rufflyFlagSnapshot() {
  return {
    enabled: isRufflyEnabled(),
    webchat: isRufflyWebchatEnabled(),
    ai: isRufflyAiEnabled(),
    voice: isRufflyVoiceEnabled(),
    campaigns: isRufflyCampaignsEnabled(),
    automations: isRufflyAutomationsEnabled(),
    sendingSms: isRufflySmsSendingEnabled(),
    sendingEmail: isRufflyEmailSendingEnabled(),
    gingrBooking: isRufflyGingrBookingEnabled()
  };
}
