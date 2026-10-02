import { END_CARD_DURATION_SECONDS, END_CARD_HEADLINE } from "./constants";
import type { LobbyAdScene } from "./types";

export const MIRACULOUS_RECOVERY_TITLE = "The Miraculous Recovery";
export { END_CARD_DURATION_SECONDS, END_CARD_HEADLINE };

export const MIRACULOUS_RECOVERY_SCENES: LobbyAdScene[] = [
  {
    id: "scene-01",
    fileName: "scene-01.mp4",
    title: "The Sick Dog",
    targetDurationSeconds: 4,
    providerDurationSeconds: 8,
    firstFrameFileName: "scene-01-start.jpg",
    caption: {
      lines: ["WHEN YOUR DOG IS", "'TOO SICK' TO DO ANYTHING..."],
      emphasize: ["TOO SICK"],
      region: "lower"
    },
    dialogue: "Dude... you really don't feel good, huh?"
  },
  {
    id: "scene-02",
    fileName: "scene-02.mp4",
    title: "The Bad News",
    targetDurationSeconds: 3,
    providerDurationSeconds: 8,
    firstFrameFileName: "scene-02-start.jpg",
    referenceFileNames: ["scene-01-start.jpg"],
    caption: {
      lines: ["OKAY... I GUESS WE'LL HAVE TO", "CANCEL FITDOG TODAY."],
      emphasize: ["FITDOG"],
      region: "lower"
    },
    dialogue: "Okay... I guess we'll have to cancel FitDog today."
  },
  {
    id: "scene-03",
    fileName: "scene-03.mp4",
    title: "The Miracle",
    targetDurationSeconds: 3,
    providerDurationSeconds: 8,
    firstFrameFileName: "scene-03-start.jpg",
    referenceFileNames: ["scene-01-start.jpg"],
    caption: {
      lines: ["WAIT... FITDOG?!"],
      emphasize: ["FITDOG"],
      region: "upper"
    },
    dialogue: "Wait... did I say FitDog?"
  },
  {
    id: "scene-04",
    fileName: "scene-04.mp4",
    title: "Instant Recovery",
    targetDurationSeconds: 4,
    providerDurationSeconds: 8,
    firstFrameFileName: "scene-04-start.jpg",
    caption: {
      lines: ["INSTANT RECOVERY."],
      emphasize: ["RECOVERY"],
      region: "lower"
    }
  },
  {
    id: "scene-05",
    fileName: "scene-05.mp4",
    title: "Arriving at FitDog",
    targetDurationSeconds: 4,
    providerDurationSeconds: 8,
    firstFrameFileName: "scene-05-start.jpg",
    usesLocationReference: true,
    caption: {
      lines: ["DID I SAY FITDOG?"],
      emphasize: ["FITDOG"],
      region: "lower"
    }
  }
];

export const END_CARD_SCENE: LobbyAdScene = {
  id: "end-card",
  fileName: "end-card.mp4",
  title: "End Card",
  targetDurationSeconds: END_CARD_DURATION_SECONDS,
  providerDurationSeconds: END_CARD_DURATION_SECONDS,
  caption: {
    lines: [...END_CARD_HEADLINE],
    emphasize: ["LAZY DAY"],
    region: "lower"
  }
};

export function liveActionScenes(): LobbyAdScene[] {
  return MIRACULOUS_RECOVERY_SCENES;
}

export function targetTimelineSeconds(): number {
  return (
    MIRACULOUS_RECOVERY_SCENES.reduce((sum, scene) => sum + scene.targetDurationSeconds, 0) +
    END_CARD_DURATION_SECONDS
  );
}
