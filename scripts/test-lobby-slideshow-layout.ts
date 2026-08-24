import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function ruleBodiesForSelector(css: string, selector: string): string[] {
  const bodies: string[] = [];
  const re = /([^{]+)\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const selectors = match[1]
      .split(",")
      .map((item) => item.replace(/\/\*[\s\S]*?\*\//g, "").trim());
    if (selectors.some((item) => item === selector || item.endsWith(selector))) {
      bodies.push(match[2]);
    }
  }
  return bodies;
}

function assertObjectFitContain(css: string, selector: string) {
  const bodies = ruleBodiesForSelector(css, selector).filter((body) => /object-fit\s*:/.test(body));
  assert.ok(bodies.length > 0, `expected object-fit rule for ${selector}`);
  for (const body of bodies) {
    assert.match(body, /object-fit:\s*contain/, `${selector} must use object-fit: contain`);
    assert.doesNotMatch(body, /object-fit:\s*cover/, `${selector} must not crop with object-fit: cover`);
  }
}

const css = source("app/globals.css");
const carousel = source("components/lobby/SocialMomentsCarousel.tsx");

assertObjectFitContain(css, ".lobby-idle-slideshow__image");
assertObjectFitContain(css, ".lobby-idle-slideshow__video");
assertObjectFitContain(css, ".lobby-idle-slideshow--tv .lobby-idle-slideshow__image");
assertObjectFitContain(css, ".lobby-idle-slideshow--tv .lobby-idle-slideshow__video");

{
  const tvFrame = ruleBodiesForSelector(css, ".lobby-idle-slideshow--tv .lobby-idle-slideshow__frame").join("\n");
  assert.match(tvFrame, /aspect-ratio:\s*16\s*\/\s*9/, "TV idle slideshow frame must stay 16:9 so designed slides fill the card");
  assert.doesNotMatch(tvFrame, /aspect-ratio:\s*auto/, "TV idle slideshow frame must not stretch into a crop box");
}

{
  const tvShellRules = ruleBodiesForSelector(css, "html.lobby-tv-display .social-video-shell");
  const tvShell = tvShellRules.join("\n");
  assert.match(tvShell, /aspect-ratio:\s*9\s*\/\s*16/, "TV social frame must stay 9:16 so Instagram clips are not cropped");
}

assertObjectFitContain(css, ".social-video-layer");
assertObjectFitContain(css, ".social-video-shell img");
assertObjectFitContain(css, ".social-video");

assert.doesNotMatch(
  css,
  /\.social-video\s*\{[^}]*transform:\s*scale\(1\.01\)/,
  "social video must not scale past the frame and clip edges"
);

const assetImage = source("components/lobby/LobbyAssetImage.tsx");
assert.match(assetImage, /if \(fill\) \{/);
assert.doesNotMatch(
  assetImage,
  /fill=\{fill\}/,
  "Next Image must not receive fill together with width and height"
);

assert.match(carousel, /social-video-poster object-contain/);
assert.equal((carousel.match(/object-cover/g) ?? []).length, 0, "lobby social posters must not use object-cover");
assert.ok(
  (carousel.match(/object-contain/g) ?? []).length >= 3,
  "lobby social posters and fallbacks must use object-contain"
);

console.log("lobby slideshow layout tests passed");
