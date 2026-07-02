export type LobbyServiceItem = {
  title: string;
  icon: string;
  labelLines?: [string, string];
};

export const LOBBY_SERVICES: LobbyServiceItem[] = [
  { title: "Daycare", icon: "daycare" },
  { title: "Overnight", icon: "overnight" },
  { title: "Grooming", icon: "grooming" },
  { title: "Taxi Service", icon: "taxi" },
  { title: "Dog Hiking", icon: "hiking" },
  { title: "Beach Excursions", icon: "beach", labelLines: ["Beach", "Excursions"] },
  { title: "Puppy Socialization", icon: "puppy-socialization", labelLines: ["Puppy", "Socialization"] },
  { title: "Obedience & Manners", icon: "obedience", labelLines: ["Obedience &", "Manners"] },
  { title: "Canine Fitness", icon: "fitness" }
];
