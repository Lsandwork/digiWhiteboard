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
  assert.match(tvFrame, /100cqw/, "TV idle slideshow frame must size from the available slot, not collapsed abs-positioned children");
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

const board = source("components/lobby/LobbyCheckoutBoard.tsx");
assert.doesNotMatch(board, /LobbyValuesFooter/);
assert.doesNotMatch(board, /Safe, Loving Environment/);
assert.match(board, /LobbyClassSchedule band/);
assert.match(board, /LobbyCheckoutShowcase/);
assert.doesNotMatch(board, /LobbyFeaturedCard/);
assert.doesNotMatch(board, /LobbyQueueList/);
assert.ok(
  board.indexOf("lobby-main-grid") < board.indexOf("LobbyClassSchedule band"),
  "class schedule must sit below the main slideshow/social grid"
);

{
  const band = ruleBodiesForSelector(css, ".lobby-class-schedule--band").join("\n");
  assert.match(band, /flex-shrink:\s*0|flex:\s*0 0 auto/);
}

assert.match(css, /\.lobby-class-schedule--band \.lobby-class-schedule__footer/);

{
  const subtitle = ruleBodiesForSelector(css, "html.lobby-tv-display .lobby-header-subtitle").join("\n");
  assert.match(subtitle, /display:\s*none/, "TV header thank-you line must collapse so slideshow can grow");
}

{
  const wordmark = ruleBodiesForSelector(css, "html.lobby-tv-display .lobby-header__wordmark").join("\n");
  assert.match(wordmark, /1\.85rem/, "TV Fitdog wordmark must stay compact");
}

{
  const idleGrid = ruleBodiesForSelector(css, "html.lobby-tv-display .lobby-idle-state .lobby-main-grid").join("\n");
  assert.match(idleGrid, /1\.12fr/, "idle TV layout must give social moments a wider column");
}

assert.match(css, /html\.lobby-tv-display \.lobby-has-checkout \.social-moments-card/);
assert.match(css, /\.lobby-has-checkout \.social-moments-card/);
assert.match(css, /\.lobby-checkout-showcase\[data-count="2"\]/);
assert.match(css, /\.lobby-checkout-showcase\[data-count="4"\]/);
assert.match(css, /\.lobby-checkout-showcase\[data-count="6"\]/);

assertObjectFitContain(css, ".lobby-checkout-dog__image");
assertObjectFitContain(css, ".lobby-checkout-dog__fallback");

const showcase = source("components/lobby/LobbyCheckoutShowcase.tsx");
assert.doesNotMatch(showcase, /object-cover/, "checkout portraits must not crop dogs");
assert.match(showcase, /data-count=\{Math\.min\(dogs\.length, 6\)\}/);
assert.match(showcase, /Checking out now/);

console.log("lobby slideshow layout tests passed");
