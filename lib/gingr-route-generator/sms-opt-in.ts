/** Staff must opt in before Gingr pickup owners are texted. Default is off. */
export function parseGingrSendOwnerSmsParam(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
