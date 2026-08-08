export type VipServiceKind =
  | "group_class"
  | "adventure_hike"
  | "beach_excursion"
  | "trainer_led_hike"
  | "taxi"
  | "other";

export type VipCadence = "weekly" | "monthly" | "custom";
export type VipClientStatus = "active" | "paused" | "cancelled";

export type VipAutoBookClient = {
  id: string;
  fitdogOwnerId: string | null;
  fitdogDogId: string | null;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  dogName: string;
  dogBreed: string | null;
  serviceKind: VipServiceKind;
  serviceName: string;
  cadence: VipCadence;
  daysOfWeek: number[];
  monthlyWeek: number | null;
  preferredTime: string | null;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
  status: VipClientStatus;
  notes: string;
  platform: string;
  needToRebook: boolean;
  needToRebookSetAt: string | null;
  rebookAlertSentAt: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  daysBookedLabel: string | null;
  lastVerifiedAt: string | null;
  lastBookedFor: string | null;
  lastBookStatus: string | null;
  lastBookError: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VipAutoBookSummary = {
  total: number;
  active: number;
  paused: number;
  weekly: number;
  monthly: number;
};

export type VipAutoBookListFilters = {
  q?: string;
  status?: VipClientStatus | "all";
  cadence?: VipCadence | "all";
  serviceKind?: VipServiceKind | "all";
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

export type VipDirectoryHit = {
  fitdogOwnerId: string | null;
  fitdogDogId: string | null;
  ownerName: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  dogName: string;
  dogBreed: string | null;
  source: "fitdog_directory" | "vip_list";
};

export const VIP_SERVICE_KIND_OPTIONS: Array<{ value: VipServiceKind; label: string }> = [
  { value: "group_class", label: "Group Class" },
  { value: "adventure_hike", label: "Adventure Hike" },
  { value: "beach_excursion", label: "Beach Excursion" },
  { value: "trainer_led_hike", label: "Trainer-Led Hike" },
  { value: "taxi", label: "Taxi" },
  { value: "other", label: "Other" }
];

export const VIP_CADENCE_OPTIONS: Array<{ value: VipCadence; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" }
];

export const DAY_OF_WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function serviceKindLabel(kind: VipServiceKind) {
  return VIP_SERVICE_KIND_OPTIONS.find((row) => row.value === kind)?.label ?? kind;
}

export function cadenceLabel(cadence: VipCadence) {
  return VIP_CADENCE_OPTIONS.find((row) => row.value === cadence)?.label ?? cadence;
}

export function formatDaysOfWeek(days: number[]) {
  if (!days.length) return "—";
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => DAY_OF_WEEK_LABELS[day] ?? String(day))
    .join(", ");
}
