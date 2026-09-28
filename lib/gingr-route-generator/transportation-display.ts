/**
 * Map normalized transportation state to UI labels.
 * Home-van booleans never label club or on-property as From Home / To Home.
 */

export type GingrTransportDisplayKind =
  | "home_pickup"
  | "home_dropoff"
  | "taxi_pickup"
  | "taxi_dropoff"
  | "owner_club_dropoff"
  | "owner_club_pickup"
  | "on_property";

export type GingrTransportDisplay = {
  kind: GingrTransportDisplayKind;
  className: string;
  title: string;
  strong: string;
  em: string;
  /** True only for FitDog/taxi legs that go to the owner's home. */
  homeVan: boolean;
};

export type GingrTransportDisplayInput = {
  pickup: boolean;
  dropoff: boolean;
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  isTaxi: boolean;
  alreadyOnProperty?: boolean;
};

export function gingrTransportDisplays(dog: GingrTransportDisplayInput): GingrTransportDisplay[] {
  const displays: GingrTransportDisplay[] = [];

  if (dog.pickup) {
    displays.push({
      kind: dog.isTaxi ? "taxi_pickup" : "home_pickup",
      className: "grg-transport-badge--pickup",
      title: dog.isTaxi ? "FitDog taxi pickup from home" : "FitDog driver picks up from home",
      strong: dog.isTaxi ? "TAXI" : "PICK UP",
      em: "From Home",
      homeVan: true
    });
  }

  if (dog.dropoff) {
    displays.push({
      kind: dog.isTaxi && !dog.pickup ? "taxi_dropoff" : "home_dropoff",
      className: "grg-transport-badge--dropoff",
      title: dog.isTaxi ? "FitDog taxi drop-off to home" : "FitDog driver drops off to home",
      strong: dog.isTaxi && !dog.pickup ? "TAXI" : "DROP OFF",
      em: "To Home",
      homeVan: true
    });
  }

  if (dog.ownerClubDropoff) {
    displays.push({
      kind: "owner_club_dropoff",
      className: "grg-transport-badge--club-in",
      title: "Owner drops the dog off at Fitdog Club",
      strong: "OWNER DROP-OFF",
      em: "At Club",
      homeVan: false
    });
  }

  if (dog.ownerClubPickup) {
    displays.push({
      kind: "owner_club_pickup",
      className: "grg-transport-badge--club-out",
      title: "Owner picks the dog up at Fitdog Club",
      strong: "OWNER PICKUP",
      em: "At Club",
      homeVan: false
    });
  }

  if (dog.alreadyOnProperty && !dog.pickup) {
    displays.push({
      kind: "on_property",
      className: "grg-transport-badge--on-property",
      title: "Dog is already checked in at Fitdog (boarding)",
      strong: "ON PROPERTY",
      em: "At Fitdog",
      homeVan: false
    });
  }

  return displays;
}
