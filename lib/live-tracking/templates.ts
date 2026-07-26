const ALLOWED_VARS = new Set([
  "dog_names",
  "tracking_url",
  "arrival_time",
  "van_name",
  "direction"
]);

export function renderTrackingTemplate(
  template: string,
  vars: Record<string, string | undefined | null>
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (!ALLOWED_VARS.has(key)) return "";
    const value = vars[key] ?? "";
    return escapeTemplateValue(String(value));
  });
}

/** Escape values to prevent HTML/script injection in templates. */
export function escapeTemplateValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

export function templateKeyForEvent(
  eventType: string,
  direction: "pickup" | "dropoff"
): string {
  switch (eventType) {
    case "notice_30":
      return `${direction}_30`;
    case "live_15":
      return `${direction}_15`;
    case "final_5":
      return `${direction}_5`;
    case "arrived":
      return `${direction}_arrived`;
    case "completed":
      return `${direction}_complete`;
    case "delay":
      return "delay";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped_owner";
    default:
      return `${direction}_15`;
  }
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  pickup_30:
    "Heads up! {{dog_names}}'s Fitdog driver is about 30 minutes away. We'll send a live tracking link when the van gets closer.",
  pickup_15: "{{dog_names}}'s Fitdog van is about 15 minutes away. Follow the driver here: {{tracking_url}}",
  pickup_5:
    "{{dog_names}}'s driver is almost there. Please have {{dog_names}} ready with any needed leash, harness, or belongings.",
  pickup_arrived: "Your Fitdog driver has arrived for {{dog_names}}.",
  pickup_complete: "{{dog_names}} has been picked up and is safely on the way.",
  dropoff_30: "{{dog_names}} is heading home. The Fitdog van is about 30 minutes away.",
  dropoff_15: "{{dog_names}} is about 15 minutes from home. Follow the Fitdog van here: {{tracking_url}}",
  dropoff_5: "{{dog_names}} is almost home. The Fitdog van is about 5 minutes away.",
  dropoff_arrived: "{{dog_names}} has arrived home.",
  dropoff_complete: "{{dog_names}} has been dropped off. Thank you for riding with Fitdog.",
  delay:
    "Your Fitdog van is running a little behind. The updated arrival estimate for {{dog_names}} is {{arrival_time}}. Follow the latest update here: {{tracking_url}}",
  cancelled: "Transportation for {{dog_names}} has been cancelled. Please contact Fitdog if you need assistance.",
  skipped_owner:
    "We're updating your transportation details. Please contact Fitdog if you need immediate assistance."
};
