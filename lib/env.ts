export function getGingrWebhookSignatureKey() {
  return process.env.GINGR_WEBHOOK_SIGNATURE_KEY ?? process.env.GINGR_WEBHOOK_SECRET;
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL;
}

export function getBoardEnvCheck() {
  return {
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    hasSupabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasGingrWebhookKey: Boolean(getGingrWebhookSignatureKey()),
    hasGingrSyncSecret: Boolean(process.env.GINGR_SYNC_SECRET),
    hasGingrApiKey: Boolean(process.env.GINGR_API_KEY),
    hasSiteUrl: Boolean(getSiteUrl())
  };
}

export function getMissingBoardEnvVars() {
  const missing: string[] = [];
  const check = getBoardEnvCheck();

  if (!check.hasSupabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!check.hasSupabaseAnon) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!check.hasServiceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return missing;
}

export function getRecommendedBoardEnvVars() {
  const recommended: string[] = [];
  const check = getBoardEnvCheck();

  if (!check.hasGingrWebhookKey) recommended.push("GINGR_WEBHOOK_SIGNATURE_KEY");
  if (!check.hasGingrApiKey) recommended.push("GINGR_API_KEY");

  return recommended;
}
