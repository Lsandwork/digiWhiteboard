/** Feature flags for Automatic Blog (server-side). */
export function isBlogEnabled() {
  const value = process.env.BLOG_ENABLED?.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "off") return false;
  // Default enabled so Super Admin can open the module; generation still gated by settings/emergency_off.
  return value !== "false";
}

export function isBlogPublicEnabled() {
  const value = process.env.BLOG_PUBLIC_ENABLED?.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "off") return false;
  return true;
}
