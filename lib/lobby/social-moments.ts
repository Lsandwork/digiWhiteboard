export type SocialMoment = {
  id: string;
  title: string;
  src: string;
  poster: string;
  sourceUrl: string | null;
  sourceType: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  playbackMode: "local-mp4-only";
};

export const SOCIAL_MOMENTS: readonly SocialMoment[] = [
  {
    id: "social-moment-01",
    title: "Instagram Post DNReXz-SYxK",
    src: "/assets/fitdog/social-moments/clips/social-moment-01.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
    sourceUrl: "https://www.instagram.com/p/DNReXz-SYxK/",
    sourceType: "instagram-post",
    durationSeconds: 15.95,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-02",
    title: "Instagram Post DUJurvrEsUL",
    src: "/assets/fitdog/social-moments/clips/social-moment-02.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-02.jpg",
    sourceUrl: "https://www.instagram.com/p/DUJurvrEsUL/",
    sourceType: "instagram-post",
    durationSeconds: 7.96,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-03",
    title: "Instagram Post DT_t7_oicFP",
    src: "/assets/fitdog/social-moments/clips/social-moment-03.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-03.jpg",
    sourceUrl: "https://www.instagram.com/p/DT_t7_oicFP/",
    sourceType: "instagram-post",
    durationSeconds: 5.7,
    width: 640,
    height: 1136,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-04",
    title: "Instagram Post DTeJIZSgY8t",
    src: "/assets/fitdog/social-moments/clips/social-moment-04.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-04.jpg",
    sourceUrl: "https://www.instagram.com/p/DTeJIZSgY8t/",
    sourceType: "instagram-post",
    durationSeconds: 17.97,
    width: 576,
    height: 1024,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-05",
    title: "Instagram Post DTMSKkbiXpE",
    src: "/assets/fitdog/social-moments/clips/social-moment-05.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
    sourceUrl: "https://www.instagram.com/p/DTMSKkbiXpE/",
    sourceType: "instagram-post",
    durationSeconds: 20.22,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-06",
    title: "Instagram Post DRAmCDqEv2K",
    src: "/assets/fitdog/social-moments/clips/social-moment-06.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-06.jpg",
    sourceUrl: "https://www.instagram.com/p/DRAmCDqEv2K/",
    sourceType: "instagram-post",
    durationSeconds: 5.0,
    width: 640,
    height: 1136,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-07",
    title: "Instagram Highlight 17873398021229888",
    src: "/assets/fitdog/social-moments/clips/social-moment-07.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-07.jpg",
    sourceUrl: "https://www.instagram.com/stories/highlights/17873398021229888/",
    sourceType: "instagram-highlight",
    durationSeconds: 14.14,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-08",
    title: "Instagram Post DQFkVOvkoOP",
    src: "/assets/fitdog/social-moments/clips/social-moment-08.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-08.jpg",
    sourceUrl: "https://www.instagram.com/p/DQFkVOvkoOP/",
    sourceType: "instagram-post",
    durationSeconds: 11.61,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  },
  {
    id: "social-moment-09",
    title: "Uploaded Social Moment 09",
    src: "/assets/fitdog/social-moments/clips/social-moment-09.mp4",
    poster: "/assets/fitdog/social-moments/posters/social-moment-09.jpg",
    sourceUrl: null,
    sourceType: "uploaded-video",
    durationSeconds: 60.21,
    width: 720,
    height: 1280,
    playbackMode: "local-mp4-only"
  }
] as const;
