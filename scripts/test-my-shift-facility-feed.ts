import assert from "node:assert/strict";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import { isCoordinatorDashboardUser, isTeamLeadDashboardUser } from "../lib/admin/team-lead-profile";
import {
  additionalServicesFromReservation,
  isExcludedGroomerAdditionalService
} from "../lib/ops-command-center/groomer-additional-services";
import {
  isDeskMyShiftFacilityService,
  isFreeDailyWalkService,
  isGroomingFacilityService,
  isYardClubFacilityService
} from "../lib/ops-command-center/gingr-service-names";
import {
  ageOnDate,
  facilityFeedToWorkItems,
  isBirthdayOnDate,
  isMyShiftFacilitySyncWindow,
  losAngelesHour,
  parseGingrBirthdate
} from "../lib/ops-command-center/my-shift-facility-feed";
import { availableActionsForKind, parseWorkItemId } from "../lib/ops-command-center/work-item-actions";
import type { GingrReservation } from "../lib/integrations/gingr/types";

const tlAccess = accessFromLegacyRole("tl-1", "halle@fitdog.test", "team_leader");
const coordinatorAccess = accessFromLegacyRole("fd-1", "desk@fitdog.test", "front_desk_coordinator");
const dualAccess = {
  ...tlAccess,
  primaryRole: "team_leader" as const,
  roles: ["team_leader", "front_desk_coordinator"] as const
};

assert.equal(isTeamLeadDashboardUser({ legacyRole: "team_leader", access: tlAccess }), true);
assert.equal(isCoordinatorDashboardUser({ legacyRole: "team_leader", access: tlAccess }), false);
assert.equal(isCoordinatorDashboardUser({ legacyRole: "front_desk_coordinator", access: coordinatorAccess }), true);
assert.equal(isTeamLeadDashboardUser({ legacyRole: "team_leader", access: dualAccess }), false);
assert.equal(isCoordinatorDashboardUser({ legacyRole: "team_leader", access: dualAccess }), true);

assert.equal(isFreeDailyWalkService("Free Daily Walk"), true);
assert.equal(isFreeDailyWalkService("Free Walk"), true);
assert.equal(isFreeDailyWalkService("Group Walk"), false);
assert.equal(isYardClubFacilityService("Private Training - Business Only"), true);
assert.equal(isYardClubFacilityService("Daily Enrichment (3pm) - Business Only"), true);
assert.equal(isYardClubFacilityService("Club Food - Business Only"), true);
assert.equal(isYardClubFacilityService("Taxi Service - Business Only"), true);
assert.equal(isYardClubFacilityService("Puzzle Playtime"), true);
assert.equal(isYardClubFacilityService("Group Walk"), true);
assert.equal(isGroomingFacilityService("Bath"), true);
assert.equal(isGroomingFacilityService("Nail Trim"), true);
assert.equal(isGroomingFacilityService("Teeth Brush"), true);
assert.equal(isDeskMyShiftFacilityService("Free Daily Walk"), false);
assert.equal(isDeskMyShiftFacilityService("Group Walk"), true);
assert.equal(isDeskMyShiftFacilityService("Bath"), true);
assert.equal(isDeskMyShiftFacilityService("Nail Trim"), true);
assert.equal(isDeskMyShiftFacilityService("Puzzle Playtime"), true);
assert.equal(isExcludedGroomerAdditionalService("Group Walk"), true);
assert.equal(isExcludedGroomerAdditionalService("Bath"), false);

assert.equal(parseGingrBirthdate("2019-08-13"), "2019-08-13");
assert.equal(parseGingrBirthdate("08/13/2019"), "2019-08-13");
assert.equal(isBirthdayOnDate("2019-08-13", "2026-08-13"), true);
assert.equal(isBirthdayOnDate("2019-08-14", "2026-08-13"), false);
assert.equal(isBirthdayOnDate("2020-02-29", "2026-02-28"), true);
assert.equal(isBirthdayOnDate("2020-02-29", "2024-02-29"), true);
assert.equal(ageOnDate("2019-08-13", "2026-08-13"), 7);
assert.equal(ageOnDate("2020-02-29", "2026-02-28"), 6);

const noonPacific = new Date("2026-08-13T19:00:00.000Z"); // 12:00 PDT
const fiveAmPacific = new Date("2026-08-13T12:00:00.000Z"); // 05:00 PDT
const sevenPmPacific = new Date("2026-08-14T02:00:00.000Z"); // 19:00 PDT
const eightPmPacific = new Date("2026-08-14T03:00:00.000Z"); // 20:00 PDT
assert.equal(losAngelesHour(noonPacific), 12);
assert.equal(isMyShiftFacilitySyncWindow(noonPacific), true);
assert.equal(isMyShiftFacilitySyncWindow(fiveAmPacific), false);
assert.equal(isMyShiftFacilitySyncWindow(sevenPmPacific), true);
assert.equal(isMyShiftFacilitySyncWindow(eightPmPacific), false);

const reservation = {
  id: "2001",
  reservation_id: "2001",
  animal: { id: "88", name: "Mabel", birthdate: "2018-08-13" },
  owner: { first_name: "Pat", last_name: "Ng" },
  reservation_type: { type: "Daycare" },
  services: [
    { id: "s1", name: "Free Daily Walk", scheduled_at: "2026-08-13 08:00:00" },
    { id: "s2", name: "Group Walk", scheduled_at: "2026-08-13 09:00:00" },
    { id: "s3", name: "Bath", scheduled_at: "2026-08-13 10:00:00" },
    { id: "s4", name: "Puzzle Playtime", scheduled_at: "2026-08-13 14:00:00" },
    { id: "s5", name: "Private Training - Business Only", scheduled_at: "2026-08-13 16:00:00" }
  ]
} as GingrReservation;

assert.deepEqual(
  additionalServicesFromReservation(reservation, "2026-08-13", { includeService: isDeskMyShiftFacilityService })
    .map((row) => row.serviceName)
    .sort(),
  ["Bath", "Group Walk", "Private Training - Business Only", "Puzzle Playtime"]
);
assert.deepEqual(
  additionalServicesFromReservation(reservation, "2026-08-13")
    .map((row) => row.serviceName)
    .sort(),
  ["Bath"]
);

const work = facilityFeedToWorkItems({
  date: "2026-08-13",
  syncedAt: "2026-08-13T13:00:00.000Z",
  birthdays: [
    {
      id: "birthday:88",
      animalId: "88",
      dogName: "Mabel",
      ownerName: "Pat Ng",
      birthdate: "2018-08-13",
      age: 8,
      presence: "checked_in",
      reservationId: "2001"
    }
  ],
  services: [
    {
      id: "svc:2001:s3:2026-08-13 10:00:00",
      serviceName: "Bath",
      dogName: "Mabel",
      ownerName: "Pat Ng",
      scheduledAt: "2026-08-13 10:00:00",
      reservationId: "2001",
      reservationType: "Daycare"
    }
  ]
});
assert.equal(work[0]?.kind, "birthday");
assert.equal(work[0]?.priority, "high");
assert.match(String(work[0]?.title), /Mabel/);
assert.equal(work[1]?.kind, "facility_service");
assert.equal(work[1]?.title, "Bath");
assert.deepEqual(parseWorkItemId(work[0].id), { kind: "birthday", sourceId: "88" });
assert.deepEqual(parseWorkItemId(work[1].id), { kind: "facility_service", sourceId: work[1].id.slice("facility:".length) });
assert.deepEqual(availableActionsForKind("birthday"), []);
assert.deepEqual(availableActionsForKind("facility_service"), []);

console.log("my-shift-facility-feed: ok");
