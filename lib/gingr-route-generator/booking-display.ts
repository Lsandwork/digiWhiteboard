import { classifyTransportationText } from "@/lib/gingr-route-generator/transportation";

/** True when Gingr text is a Service Addon / transport line, not a reservation category. */
export function isGingrTransportBookingLabel(raw: string | null | undefined): boolean {
  const text = String(raw || "").trim();
  if (!text) return false;
  if (classifyTransportationText(text) !== "UNKNOWN") return true;
  return /^(before|after)\s+outing\b/i.test(text);
}

/** Strip the Gingr prefix on additional services (`Activity | Adventure Hike`). */
export function stripGingrActivityServicePrefix(name: string): string {
  return String(name || "")
    .replace(/^activity\s*\|\s*/i, "")
    .trim();
}

export type GingrBookedDisplay = {
  reservationType: string | null;
  activities: string[];
  summary: string;
};

/** Human-readable Booked As line: reservation type, activities, and optional visit. */
export function buildGingrBookedDisplay(input: {
  reservationType: string | null;
  bookedActivityLabels: string[];
  visitLabel?: string | null;
  isTaxi?: boolean;
}): GingrBookedDisplay {
  const reservationType = input.reservationType?.trim() || null;
  const activities = input.bookedActivityLabels.filter(Boolean);
  const parts: string[] = [];
  if (reservationType) parts.push(reservationType);
  for (const label of activities) {
    if (reservationType && label.toLowerCase() === reservationType.toLowerCase()) continue;
    parts.push(label);
  }
  if (input.visitLabel) parts.push(input.visitLabel);
  if (!parts.length && input.isTaxi) parts.push("Taxi Service");
  if (!parts.length) parts.push("Scheduled");
  return {
    reservationType,
    activities: activities.filter(
      (label) => !reservationType || label.toLowerCase() !== reservationType.toLowerCase()
    ),
    summary: parts.join(" · ")
  };
}