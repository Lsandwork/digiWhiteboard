export type LobbyScheduleDay = {
  day: string;
  classes: string[];
};

export const LOBBY_CLASS_SCHEDULE: LobbyScheduleDay[] = [
  {
    day: "Monday",
    classes: ["Adventure Hike", "Beach Excursion", "Recall at the Beach", "Foundations & Focus", "Cool Tricks"]
  },
  {
    day: "Tuesday",
    classes: ["Adventure Hike", "Canine Conditioning", "Leash Manners", "Scent Works"]
  },
  {
    day: "Wednesday",
    classes: ["Adventure Hike", "Beach Excursion", "Trainer-led Hike"]
  },
  {
    day: "Thursday",
    classes: ["Adventure Hike", "Trainer-led Hike"]
  },
  {
    day: "Friday",
    classes: [
      "Adventure Hike",
      "Beach Excursion",
      "Trail Foundations",
      "Reliable Recall",
      "Urban Recall"
    ]
  }
];
