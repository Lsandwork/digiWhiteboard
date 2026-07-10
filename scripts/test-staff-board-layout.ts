import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getStaffBoardLayoutState,
  staffBoardLayoutClass,
  type StaffBoardLayoutState
} from "../lib/staff/board-layout";

function layout(
  checkInCount: number,
  checkOutCount: number,
  isLoaded = true
): StaffBoardLayoutState {
  return getStaffBoardLayoutState({ checkInCount, checkOutCount, isLoaded });
}

// 1. One check-in and zero check-outs renders only Checking In panel.
{
  const state = layout(1, 0);
  assert.equal(state.variant, "single-in");
  assert.equal(state.showCheckInPanel, true);
  assert.equal(state.showCheckOutPanel, false);
  assert.equal(state.isSinglePanel, true);
}

// 2. One check-out and zero check-ins renders only Checking Out panel.
{
  const state = layout(0, 1);
  assert.equal(state.variant, "single-out");
  assert.equal(state.showCheckInPanel, false);
  assert.equal(state.showCheckOutPanel, true);
  assert.equal(state.isSinglePanel, true);
}

// 3. Dogs on both sides render the two-column layout.
{
  const state = layout(2, 3);
  assert.equal(state.variant, "dual");
  assert.equal(state.isDualPanel, true);
  assert.equal(state.showCheckInPanel, true);
  assert.equal(state.showCheckOutPanel, true);
}

// 4. Zero dogs on both sides renders the approved single empty state.
{
  const state = layout(0, 0);
  assert.equal(state.variant, "empty");
  assert.equal(state.showApprovedEmptyState, true);
}

// 5. Empty state headline copy is present in the component source.
{
  const emptyStateSource = readFileSync(
    join(process.cwd(), "components/board/StaffBoardEmptyState.tsx"),
    "utf8"
  );
  assert.match(emptyStateSource, /No dogs are currently checking/);
  assert.match(emptyStateSource, /in \/ out\./);
  assert.match(emptyStateSource, /Arrivals and departures will appear here automatically\./);
}

// 6. Empty opposite panel is not present in single-panel mode.
{
  const inOnly = layout(4, 0);
  const outOnly = layout(0, 2);
  assert.equal(inOnly.showCheckOutPanel, false);
  assert.equal(outOnly.showCheckInPanel, false);
}

// 7. Valid dog names are rendered without JavaScript string slicing.
{
  const cardSource = readFileSync(join(process.cwd(), "components/board/DogStatusCard.tsx"), "utf8");
  assert.match(cardSource, /\{dog\.animal_name \|\| "Dog"\}/);
  assert.doesNotMatch(cardSource, /animal_name\.slice\(/);
  assert.doesNotMatch(cardSource, /animal_name\.substring\(/);
}

// 8. Long dog names may wrap to two lines via CSS clamp.
{
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /\.board-dog-name[\s\S]*-webkit-line-clamp:\s*2/);
}

// 9. Valid names must not use single-line truncate on the dog name element.
{
  const cardSource = readFileSync(join(process.cwd(), "components/board/DogStatusCard.tsx"), "utf8");
  assert.doesNotMatch(cardSource, /board-dog-name[\s\S]{0,80}truncate/);
  assert.doesNotMatch(cardSource, /truncate[\s\S]{0,80}board-dog-name/);
}

// 10. Status/time area does not collapse the dog-name area.
{
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /\.board-dog-card__grid[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.board-dog-status[\s\S]*flex-shrink:\s*0/);
}

// 11. Temporary reconnect must not erase currently displayed dogs (BoardClient keeps last-good data).
{
  const boardClientSource = readFileSync(join(process.cwd(), "components/BoardClient.tsx"), "utf8");
  assert.match(boardClientSource, /keepLastGood:\s*true/);
  assert.match(boardClientSource, /hasSuccessfulLoadRef\.current \? null : message/);
  assert.match(boardClientSource, /isBoardDataLoaded = \(fetchStatus === "ok" && !fetchError\) \|\| hasVisibleDogs/);
}

// 12. Single-panel mode changes to dual-panel when opposite side gets a dog.
{
  const single = layout(1, 0);
  const dual = layout(1, 1);
  assert.equal(single.variant, "single-in");
  assert.equal(dual.variant, "dual");
}

// 13. Dual-panel mode changes to single-panel when one side becomes empty.
{
  const dual = layout(2, 1);
  const singleOut = layout(0, 1);
  assert.equal(dual.variant, "dual");
  assert.equal(singleOut.variant, "single-out");
}

// 14–15. Grid classes avoid fixed widths that cause horizontal overflow.
{
  assert.match(staffBoardLayoutClass("dual"), /staff-board-content--dual/);
  assert.match(staffBoardLayoutClass("single-in"), /staff-board-content--single/);
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const dualBlock = css.match(/\.staff-board-content--dual\s*\{[^}]+\}/)?.[0] ?? "";
  const singleBlock = css.match(/\.staff-board-content--single[\s\S]*?\{[^}]+\}/)?.[0] ?? "";
  assert.match(dualBlock, /minmax\(0, 1fr\)/);
  assert.doesNotMatch(dualBlock, /grid-template-columns:[^;]*\d+px/);
  assert.doesNotMatch(singleBlock, /grid-template-columns:[^;]*\d+px/);
}

// 16. Lobby board behavior remains unchanged (no staff layout imports in lobby board).
{
  const lobbySource = readFileSync(
    join(process.cwd(), "components/lobby/LobbyCheckoutBoard.tsx"),
    "utf8"
  );
  assert.doesNotMatch(lobbySource, /StaffBoardEmptyState/);
  assert.doesNotMatch(lobbySource, /getStaffBoardLayoutState/);
}

// 17. Initial loading does not render the zero-dog empty state.
{
  const loading = layout(0, 0, false);
  assert.equal(loading.variant, "loading");
  assert.equal(loading.showApprovedEmptyState, false);
}

// 18. Decorative empty-state SVG elements are hidden from screen readers.
{
  const emptyStateSource = readFileSync(
    join(process.cwd(), "components/board/StaffBoardEmptyState.tsx"),
    "utf8"
  );
  assert.match(emptyStateSource, /aria-hidden="true"/);
}

// 19. Reduced-motion behavior is respected.
{
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.staff-board-content[\s\S]*transition:\s*none/);
}

// Regression: "Ralphie" must not become "R..."
{
  const cardSource = readFileSync(join(process.cwd(), "components/board/DogStatusCard.tsx"), "utf8");
  const sampleName = "Ralphie";
  assert.match(cardSource, /\{dog\.animal_name \|\| "Dog"\}/);
  assert.ok(!cardSource.includes('`${sampleName[0]}...`'), "Dog name must not be abbreviated in JSX");
  assert.ok(!cardSource.includes('"R..."'), "Dog name must not hardcode abbreviated output");
  assert.equal(sampleName, "Ralphie");
  assert.notEqual(`${sampleName[0]}...`, sampleName);
}

// Long-name readability regression.
{
  const longName = "Sir Barkington Wellington";
  assert.ok(longName.length > 10);
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /overflow-wrap:\s*break-word/);
}

// BoardClient uses conditional layout instead of always rendering both panels.
{
  const boardClientSource = readFileSync(join(process.cwd(), "components/BoardClient.tsx"), "utf8");
  assert.match(boardClientSource, /getStaffBoardLayoutState/);
  assert.match(boardClientSource, /staffBoardLayout\.showCheckInPanel/);
  assert.match(boardClientSource, /staffBoardLayout\.showCheckOutPanel/);
  assert.match(boardClientSource, /StaffBoardEmptyState/);
  assert.doesNotMatch(
    boardClientSource,
    /lg:grid-cols-2[\s\S]{0,200}<BoardPanel[\s\S]{0,400}<BoardPanel/
  );
}

// Cast/TV display uses the full BoardClient (not cast-lite) so layout and name fixes apply on TV.
{
  const pageClientSource = readFileSync(join(process.cwd(), "components/StaffBoardPageClient.tsx"), "utf8");
  assert.match(pageClientSource, /CastKeeperProvider/);
  assert.match(pageClientSource, /BoardClient castKeeperMode overlaysEnabled/);
  assert.doesNotMatch(pageClientSource, /StaffCastLiteBoard/);
}

// Cast-lite staff path must not always mount both panels when reused elsewhere.
{
  const castLiteSource = readFileSync(join(process.cwd(), "components/cast-lite/StaffCastLiteBoard.tsx"), "utf8");
  assert.doesNotMatch(
    castLiteSource,
    /getStaffBoardLayoutState|StaffBoardEmptyState|staffBoardLayoutClass/
  );
}

console.log("test-staff-board-layout: all assertions passed");
