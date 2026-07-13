export const LOBBY_SLIDESHOW_BASE = "/assets/fitdog-lobby-whiteboard/slideshow";

export type LobbySlideshowSlide = {
  src: string;
  alt: string;
  mediaType?: "image" | "video";
  poster?: string | null;
  id?: string;
  uploaded?: boolean;
};

export const LOBBY_IDLE_SLIDESHOW: LobbySlideshowSlide[] = [
  { src: `${LOBBY_SLIDESHOW_BASE}/13-recall-series.png`, alt: "Recall series training classes" },
  { src: `${LOBBY_SLIDESHOW_BASE}/01-not-a-puppy-training.png`, alt: "Not a Puppy fitdog training classes" },
  { src: `${LOBBY_SLIDESHOW_BASE}/02-bath-day-sundays.png`, alt: "Bath Day Sundays grooming special" },
  { src: `${LOBBY_SLIDESHOW_BASE}/03-no-bad-dogs.png`, alt: "There Are No Bad Dogs training series" },
  { src: `${LOBBY_SLIDESHOW_BASE}/04-boarding-checklist.png`, alt: "Boarding checklist" },
  { src: `${LOBBY_SLIDESHOW_BASE}/05-safety-first-collars.png`, alt: "Safety first collar requirements" },
  { src: `${LOBBY_SLIDESHOW_BASE}/06-advanced-trainer-hike.png`, alt: "Advanced trainer-led hike class" },
  { src: `${LOBBY_SLIDESHOW_BASE}/07-cool-tricks.png`, alt: "Cool Tricks training class" },
  { src: `${LOBBY_SLIDESHOW_BASE}/08-dog-of-month-juno.png`, alt: "Dog of the month Juno" },
  { src: `${LOBBY_SLIDESHOW_BASE}/09-puppy-fitdog-offer.png`, alt: "Puppy Fitdog 30 day offer" },
  { src: `${LOBBY_SLIDESHOW_BASE}/10-new-member-deals.png`, alt: "New member deals" },
  { src: `${LOBBY_SLIDESHOW_BASE}/11-pet-donation-drive.png`, alt: "Pet donation drive" },
  { src: `${LOBBY_SLIDESHOW_BASE}/12-foundations-and-focus.png`, alt: "Foundations and Focus training class" },
  { src: `${LOBBY_SLIDESHOW_BASE}/14-show-off-your-dog.png`, alt: "Show off your dog on Instagram" },
  { src: `${LOBBY_SLIDESHOW_BASE}/15-flea-season.png`, alt: "Flea season is year round" },
  { src: `${LOBBY_SLIDESHOW_BASE}/16-teeth-cleaning.png`, alt: "Non-anesthetic teeth cleanings" },
  { src: `${LOBBY_SLIDESHOW_BASE}/17-vaccine-schedule.png`, alt: "Vaccine requirements schedule" },
  { src: `${LOBBY_SLIDESHOW_BASE}/18-enrichment-classes.png`, alt: "Enrichment classes" },
  { src: `${LOBBY_SLIDESHOW_BASE}/19-enrichment-activities.png`, alt: "Fitdog enrichment activities" }
];

export const LOBBY_SLIDESHOW_INTERVAL_MS = 9000;
