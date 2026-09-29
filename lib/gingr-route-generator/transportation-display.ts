/**
 * Map normalized transportation state to UI labels.
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
  homeVan: boolean;
};

export type GingrTransportDisplayInput = {
  pickup: boolean;
  dropoff: boolean;
  pickupDestination?: "home" | "club";
  dropoffDestination?: "home" | "club";
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  returnToClub?: boolean;
  isTaxi: boolean;
  alreadyOnProperty?: boolean;
};

export function gingrTransportDisplays(dog: GingrTransportDisplayInput): GingrTransportDisplay[] {
  const displays: GingrTransportDisplay[] = [];
  const pickupDest = dog.pickup ? dog.pickupDestination || "home" : null;
  const dropoffDest = dog.dropoff
    ? dog.dropoffDestination || "home"
    : dog.returnToClub
      ? "club"
      : null;

  if (pickupDest === "home") {
    displays.push({
      kind: dog.isTaxi ? "taxi_pickup" : "home_pickup",
      className: "grg-transport-badge--pickup",
      title: dog.isTaxi ? "FitDog taxi pickup from home" : "FitDog driver picks up from home",
      strong: dog.isTaxi ? "TAXI" : "PICK UP",
      em: "From Home",
      homeVan: true
    });
  } else if (pickupDest === "club") {
    displays.push({
      kind: "owner_club_dropoff",
      className: "grg-transport-badge--club-in",
      title: "Pickup stop is Fitdog Club",
      strong: "PICK UP",
      em: "Fitdog Club",
      homeVan: false
    });
  }

  if (dropoffDest === "home") {
    displays.push({
      kind: dog.isTaxi && pickupDest !== "home" ? "taxi_dropoff" : "home_dropoff",
      className: "grg-transport-badge--dropoff",
      title: dog.isTaxi ? "FitDog taxi drop-off to home" : "FitDog driver drops off to home",
      strong: dog.isTaxi && pickupDest !== "home" ? "TAXI" : "DROP OFF",
      em: "To Home",
      homeVan: true
    });
  } else if (dropoffDest === "club") {
    displays.push({
      kind: "owner_club_pickup",
      className: "grg-transport-badge--club-out",
      title: "Drop-off stop is Fitdog Club",
      strong: "DROP OFF",
      em: "Fitdog Club",
      homeVan: false
    });
  }

  return displays;
}
