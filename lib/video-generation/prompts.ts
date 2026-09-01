import { LOCATION_REFERENCE_FILE } from "./constants";
import type { LobbyAdScene } from "./types";

/**
 * Locked character / world bible. Injected into every Veo prompt so the dog,
 * owner, wardrobe, and home stay consistent across independently generated clips.
 */
export const CHARACTER_BIBLE = `Photorealistic live-action commercial, 35mm cinematic photography, natural indoor window light, shallow depth of field, professional color grade, warm neutrals (charcoal, beige, oak), Fitdog orange used only as a tiny real-world accent if it naturally appears. Not cartoon, not 3D, not animation, not a slideshow, not AI-looking skin, not uncanny faces.

THE DOG (same individual in every shot): a medium-large adult Golden Retriever, light honey-gold fur, soft floppy ears, dark amber eyes, black nose, friendly slightly goofy face, realistic anatomy and fur physics, brown leather collar with a small round metal tag. No costume. No human clothes.

THE OWNER (same person in every shot): a woman in her early 30s, olive-warm skin, dark brown hair pulled back in a low ponytail, natural makeup, warm relatable expression. Indoors she wears a beige oatmeal oversized sweatshirt and black leggings. Outdoors she wears black athletic leggings, black sneakers, and the same beige sweatshirt. She moves and talks like a real person, not a mannequin.

HOME: a beautiful modern Los Angeles house interior — charcoal fabric couch, cream textured throw blanket, oak floors, simple art, plants. No on-screen text, captions, subtitles, logos, watermarks, or lower-thirds in the camera image (captions are added later).`;

export const NEGATIVE_PROMPT = [
  "cartoon",
  "anime",
  "3D render",
  "CGI",
  "slideshow",
  "Ken Burns still photo",
  "morphing face",
  "uncanny valley",
  "extra legs",
  "deformed dog",
  "text overlay",
  "subtitles",
  "captions",
  "watermark",
  "logo bug",
  "split screen",
  "storyboard panel",
  "comic book"
].join(", ");

export function scenePrompt(scene: LobbyAdScene): string {
  const dialogue = scene.dialogue
    ? `Spoken English dialogue must be clearly audible and perfectly lip-synced: the owner says, "${scene.dialogue}" Natural conversational delivery, not theatrical.`
    : "No scripted human dialogue. Natural diegetic sound only.";

  const location = scene.usesLocationReference
    ? `LOCATION LOCK: The exterior MUST match the provided Fitdog Sports Club entrance reference photograph exactly — red brick facade, modern gray/black stone door surround, glass door, building number 1712 on the brick to the right of the door, Fitdog signage above the door, parking sign on the brick. Do not invent a different daycare building. Camera follows behind the owner and dog as they walk toward that real entrance. Reference image: ${LOCATION_REFERENCE_FILE}.`
    : "";

  return [CHARACTER_BIBLE, sceneBody(scene.id), dialogue, location, "16:9 landscape, realistic motion, continuous camera, 24fps cinematic commercial."]
    .filter(Boolean)
    .join("\n\n");
}

function sceneBody(sceneId: string): string {
  switch (sceneId) {
    case "scene-01":
      return `SCENE 1 — THE "SICK" DOG. Interior living room. The Golden Retriever is dramatically sprawled on the charcoal couch under a cream textured blanket, pretending to be extremely sick: drooping eyelids, weak little sigh, head on a pillow, a blue tissue box nearby. The owner sits beside the dog, concerned, gently pets the dog's shoulder, and speaks the line naturally while looking at the dog. Slow cinematic push-in. Subtle breathing, blanket shift, hand petting fur. Humorous but believable.`;
    case "scene-02":
      return `SCENE 2 — THE BAD NEWS. Same living room, same people, continuous story. The owner glances at her phone then at the dog, still concerned, and clearly speaks the line, emphasizing the word FitDog. Immediately after she says "FitDog", smash to a tight close-up of the dog's face: still under the blanket, eyes half-open, miserable — then a tiny flicker of attention at the word FitDog. Quick cinematic close-up. The word FitDog must be clearly spoken.`;
    case "scene-03":
      return `SCENE 3 — THE MIRACLE. Same dog, same owner, same couch. Comedic timing: the dog's ears suddenly stand up, eyes fly wide open, exhausted face becomes fully energetic in one beat. Brief pause. The owner looks confused. The dog leaps off the couch with full athletic energy, blanket flying. The owner says the line. The dog excitedly barks and runs out of frame. Natural dog physics, tail motion, real jump.`;
    case "scene-04":
      return `SCENE 4 — INSTANT RECOVERY. Fast cinematic sequence inside the same modern home: the Golden Retriever sprints down a hallway with oak floors, tail wagging hard, grabs a brown leather leash in its mouth, skids to the dark front door and waits impatiently, looking back. The owner laughs and tries to keep up in the background. Handheld-feeling tracking energy, real running gait, fur and leash physics. The joke is that FitDog instantly cured the fake illness.`;
    case "scene-05":
      return `SCENE 5 — ARRIVING AT FITDOG. Exterior daylight. Camera follows behind the owner walking the excited Golden Retriever on a leash toward the REAL Fitdog Sports Club entrance (red brick, gray door frame, glass door, address 1712). The dog pulls slightly with excitement, tail wagging. The owner laughs naturally. The dog enthusiastically approaches the front door. Natural walking motion, leash tension, documentary-commercial hybrid.`;
    default:
      return "";
  }
}
