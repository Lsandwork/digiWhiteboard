export type LobbyServiceItem = {
  title: string;
  icon: string;
  tagline: string;
  labelLines?: [string, string];
};

export const LOBBY_SERVICES_SLIDE_INTERVAL_MS = 5000;
export const LOBBY_SERVICES_PER_SLIDE = 3;

export function getLobbyServicePages(servicesPerSlide = LOBBY_SERVICES_PER_SLIDE) {
  const pages: LobbyServiceItem[][] = [];

  for (let index = 0; index < LOBBY_SERVICES.length; index += servicesPerSlide) {
    pages.push(LOBBY_SERVICES.slice(index, index + servicesPerSlide));
  }

  return pages;
}

export const LOBBY_SERVICES: LobbyServiceItem[] = [
  { title: "Daycare", icon: "daycare", tagline: "Full-day fun, play & social time" },
  { title: "Overnight", icon: "overnight", tagline: "Comfy stays while you're away" },
  { title: "Grooming", icon: "grooming", tagline: "Fresh, clean & looking great" },
  { title: "Taxi Service", icon: "taxi", tagline: "Door-to-door pup transport" },
  { title: "Dog Hiking", icon: "hiking", tagline: "Trail adventures with our team" },
  {
    title: "Beach Excursions",
    icon: "beach",
    tagline: "Sun, sand & splashes",
    labelLines: ["Beach", "Excursions"]
  },
  {
    title: "Puppy Socialization",
    icon: "puppy-socialization",
    tagline: "Confidence starts early",
    labelLines: ["Puppy", "Socialization"]
  },
  {
    title: "Obedience & Manners",
    icon: "obedience",
    tagline: "Polite pups, happy homes",
    labelLines: ["Obedience &", "Manners"]
  },
  { title: "Canine Fitness", icon: "fitness", tagline: "Strength, agility & wellness" }
];
