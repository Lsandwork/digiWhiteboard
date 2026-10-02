/**
 * Map normalized transportation state to UI labels.
 * Home van legs, Fitdog Club van legs, and owner-operated club hand-offs are distinct.
 */

import { dogHasOffsiteActivity, type GingrRouteActivityId } from "@/lib/gingr-route-generator/activities";

export type GingrTransportDisplayKind =
  | "home_pickup"
  | "home_dropoff"
  | "taxi_pickup"
  | "taxi_dropoff"
  | "club_pickup"
  | "club_dropoff"
  | "owner_club_dropoff"
  | "owner_club_pickup"
  | "on_property";

export type GingrTransportDisplay = {
  kind: GingrTransportDisplayKind;
  className: string;
  title: string;
  strong: string;
  em: string;
  /** Fitdog van leg starting or ending at the owner's home. */
  homeVan: boolean;
  /** Any Fitdog van leg, home or Fitdog Club. */
  vanLeg: boolean;
};

export type GingrTransportDisplayInput = {
  pickup: boolean;
  dropoff: boolean;
  pickupDestination?: "home" | "club" | null;
  dropoffDestination?: "home" | "club" | null;
  startLocation?: "home" | "club";
  endLocation?: "home" | "club";
  clubTransportLocation?: boolean;
  activities?: GingrRouteActivityId[];
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  returnToClub?: boolean;
  /** Canonical Gingr appointment option labels for this date. */
  appointmentOptions?: string[];
  isTaxi: boolean;
  alreadyOnProperty?: boolean;
};

export function gingrTransportDisplays(dog: GingrTransportDisplayInput): GingrTransportDisplay[] {
  const displays: GingrTransportDisplay[] = [];
  const homePickup = dog.pickup && dog.pickupDestination === "home";
  const homeDropoff = dog.dropoff && dog.dropoffDestination === "home";
  const offsite = dogHasOffsiteActivity(dog.activities || []);
  const clubPickupLeg = offsite && Boolean(dog.clubTransportLocation || dog.ownerClubDropoff);
  const clubDropoffLeg = offsite && Boolean(dog.clubTransportLocation);

  if (homePickup) {
    displays.push({
      kind: dog.isTaxi ? "taxi_pickup" : "home_pickup",
      className: "grg-transport-badge--pickup",
      title: dog.isTaxi ? "FitDog taxi pickup from home" : "FitDog driver picks up from home",
      strong: dog.isTaxi ? "TAXI" : "PICK UP",
      em: "From Home",
      homeVan: true,
      vanLeg: true
    });
  } else if (dog.ownerClubDropoff) {
    displays.push({
      kind: "owner_club_dropoff",
      className: "grg-transport-badge--club-in",
      title: "Owner brings the dog to Fitdog Club",
      strong: "OWNER DROP OFF",
      em: "At Club",
      homeVan: false,
      vanLeg: false
    });
  } else if (clubPickupLeg) {
    displays.push({
      kind: "club_pickup",
      className: "grg-transport-badge--pickup",
      title: "Fitdog van picks the dog up at Fitdog Club",
      strong: "PICK UP",
      em: "At Fitdog Club",
      homeVan: false,
      vanLeg: true
    });
  } else if (
    dog.alreadyOnProperty &&
    !dog.ownerClubDropoff &&
    !dog.ownerClubPickup &&
    !(dog.appointmentOptions?.length)
  ) {
    displays.push({
      kind: "on_property",
      className: "grg-transport-badge--club-in",
      title: "Dog is already at Fitdog Club",
      strong: "AT CLUB",
      em: "Already on property",
      homeVan: false,
      vanLeg: false
    });
  }

  if (clubPickupLeg && dog.ownerClubDropoff) {
    displays.push({
      kind: "club_pickup",
      className: "grg-transport-badge--pickup",
      title: "Fitdog van picks the dog up at Fitdog Club",
      strong: "PICK UP",
      em: "At Fitdog Club",
      homeVan: false,
      vanLeg: true
    });
  }

  if (homeDropoff) {
    displays.push({
      kind: dog.isTaxi && !homePickup ? "taxi_dropoff" : "home_dropoff",
      className: "grg-transport-badge--dropoff",
      title: dog.isTaxi ? "FitDog taxi drop-off to home" : "FitDog driver drops off to home",
      strong: dog.isTaxi && !homePickup ? "TAXI" : "DROP OFF",
      em: "To Home",
      homeVan: true,
      vanLeg: true
    });
  } else if (clubDropoffLeg) {
    displays.push({
      kind: "club_dropoff",
      className: "grg-transport-badge--dropoff",
      title: "Fitdog van returns the dog to Fitdog Club",
      strong: "DROP OFF",
      em: "At Fitdog Club",
      homeVan: false,
      vanLeg: true
    });
  } else if (dog.ownerClubPickup) {
    displays.push({
      kind: "owner_club_pickup",
      className: "grg-transport-badge--club-out",
      title: "Owner picks the dog up at Fitdog Club",
      strong: homePickup && !homeDropoff ? "STAYS AT CLUB" : "OWNER PICK UP",
      em: "At Club",
      homeVan: false,
      vanLeg: false
    });
  }

  return displays;
}
