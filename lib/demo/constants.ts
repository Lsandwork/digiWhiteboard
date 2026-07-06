import type { LiveDog } from "@/lib/types";
import type { GroomingPushNotice } from "@/lib/staff/grooming-push-notices";
import type { StaffPushNotice } from "@/lib/staff/push-notices";

export const DEMO_EMAIL = "demo@demo.com";
export const DEMO_PASSWORD = "password123";

export const DEMO_DOG_PHOTO = "/assets/fitdog-lobby-whiteboard/slideshow/14-show-off-your-dog.png";

export const DEMO_ROLE_OPTIONS = [
  { value: "owner_admin", label: "Admin" },
  { value: "manager_admin", label: "Management" },
  { value: "front_desk_coordinator", label: "Front Desk" },
  { value: "team_leader", label: "Team Lead" },
  { value: "groomer", label: "Groomer" },
  { value: "trainer", label: "Trainer" },
  { value: "viewer", label: "Viewer" }
] as const;

export type DemoPushAction = "check_in" | "check_out" | "grooming";

export type DemoInvestorStats = {
  dogs_checked_in_today: number;
  dogs_checked_out_today: number;
  active_daycare: number;
  grooming_queue: number;
  staff_on_duty: number;
  satisfaction_score: number;
};

export type DemoSandbox = {
  checking_in: LiveDog[];
  checking_out: LiveDog[];
  grooming_notices: GroomingPushNotice[];
  staff_push_notices: StaffPushNotice[];
  stats: DemoInvestorStats;
  last_updated: string;
};

function demoDogId(name: string) {
  return `demo-${name.toLowerCase().replace(/[^\w]+/g, "-")}`;
}

export function parseDemoDogName(input: string) {
  const trimmed = input.trim() || "Max Smith";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return { dog_name: parts.slice(0, -1).join(" "), owner_name: parts[parts.length - 1]! };
  }
  return { dog_name: trimmed, owner_name: "Smith" };
}

export function buildDemoLiveDog(
  input: string,
  status: "checking_in" | "checking_out",
  room = "Front Desk"
): LiveDog {
  const now = new Date().toISOString();
  const { dog_name, owner_name } = parseDemoDogName(input);
  const displayName = `${dog_name} ${owner_name}`.trim();

  return {
    id: demoDogId(displayName),
    gingr_reservation_id: null,
    gingr_animal_id: null,
    animal_name: dog_name,
    owner_name,
    photo_url: DEMO_DOG_PHOTO,
    reservation_type: "Daycare",
    current_status: status,
    display_status: status,
    room,
    notes: null,
    flags: status === "checking_out" ? { checkout_prompted: true } : {},
    status_started_at: now,
    completed_at: null,
    display_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    last_seen_from_gingr_at: now,
    raw_payload: { source: "demo_sandbox", demo: true },
    hidden: false,
    updated_at: now
  };
}

export function buildInitialDemoSandbox(): DemoSandbox {
  const now = new Date().toISOString();
  return {
    checking_in: [
      buildDemoLiveDog("Cooper Martinez", "checking_in", "Parking Lot"),
      buildDemoLiveDog("Luna Parker", "checking_in", "Big Side")
    ],
    checking_out: [],
    grooming_notices: [],
    staff_push_notices: [],
    stats: {
      dogs_checked_in_today: 47,
      dogs_checked_out_today: 39,
      active_daycare: 28,
      grooming_queue: 3,
      staff_on_duty: 14,
      satisfaction_score: 98
    },
    last_updated: now
  };
}

export function buildDemoGroomingNoticeFromFields(
  fields: {
    dog_name: string;
    dog_id?: string | null;
    dog_photo_url?: string | null;
    owner_name?: string | null;
    owner_initial?: string | null;
    service?: string;
    groomer_name?: string;
    action?: string;
    notes?: string | null;
    safety_tags?: string[];
  },
  requestedBy: string | null
): GroomingPushNotice {
  const now = new Date();
  const owner_name = fields.owner_name ?? null;
  const expires = new Date(now.getTime() + 5 * 60 * 1000);

  return {
    id: `demo-grooming-${Date.now()}`,
    dog_id: fields.dog_id ?? demoDogId(`${fields.dog_name} ${owner_name ?? ""}`.trim()),
    dog_name: fields.dog_name,
    dog_photo_url: fields.dog_photo_url ?? DEMO_DOG_PHOTO,
    owner_name,
    owner_initial: fields.owner_initial ?? (owner_name ? owner_name.charAt(0).toUpperCase() : null),
    service: fields.service ?? "Grooming",
    groomer_name: fields.groomer_name ?? "Demo Groomer",
    action: fields.action ?? "Bring to Catch",
    notes: fields.notes ?? null,
    safety_tags: fields.safety_tags ?? [],
    status: "active",
    requested_by: requestedBy,
    requested_at: now.toISOString(),
    expires_at: expires.toISOString(),
    cleared_at: null,
    cleared_by: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };
}

export function buildDemoGroomingNotice(dogInput: string, requestedBy: string | null): GroomingPushNotice {
  const { dog_name, owner_name } = parseDemoDogName(dogInput);
  return buildDemoGroomingNoticeFromFields(
    {
      dog_name,
      owner_name,
      owner_initial: owner_name.charAt(0).toUpperCase(),
      service: "Grooming",
      groomer_name: "Demo Groomer",
      action: "Bring to Catch",
      notes: "Investor demo grooming push",
      safety_tags: []
    },
    requestedBy
  );
}
