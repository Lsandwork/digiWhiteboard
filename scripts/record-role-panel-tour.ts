/**
 * Records a walkthrough video of each demo role logging in and visiting every panel tab.
 *
 * Usage (run each command on its own line — do not paste shell comments after npm):
 *   npm run setup:record
 *   npm run dev                    # terminal 1, unless using RECORD_BASE_URL
 *   npm run record:role-tour       # terminal 2
 *
 * Record against production instead of localhost:
 *   RECORD_BASE_URL=https://fitdog-gingr-status-board.vercel.app npm run record:role-tour
 *
 * Output:
 *   videos/fitdog-role-panel-tour.webm  (and .mp4 when ffmpeg is installed)
 */
import { execSync, spawnSync } from "node:child_process";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_ROLE_OPTIONS } from "../lib/demo/constants";
import { canAccessAdminTab, accessFromLegacyRole } from "../lib/admin/permissions";
import { ADMIN_TABS, type AdminBoardType, type AdminTab } from "../lib/admin/types";
import { getTabLabel } from "../lib/admin/nav-groups";

const BASE_URL = (process.env.RECORD_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUTPUT_DIR = path.join(process.cwd(), "videos");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const FINAL_WEBM = path.join(OUTPUT_DIR, "fitdog-role-panel-tour.webm");
const FINAL_MP4 = path.join(OUTPUT_DIR, "fitdog-role-panel-tour.mp4");
const PAGE_PAUSE_MS = Number(process.env.RECORD_PAGE_PAUSE_MS ?? 1400);
const TITLE_PAUSE_MS = Number(process.env.RECORD_TITLE_PAUSE_MS ?? 2200);
const TAB_BANNER_MS = Number(process.env.RECORD_TAB_BANNER_MS ?? 900);

function tabsForRole(role: string, board: AdminBoardType): AdminTab[] {
  const access = accessFromLegacyRole(null, DEMO_EMAIL, role);
  return ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, role, board, { isDemo: true }));
}

function hasFfmpeg() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

async function showTitleCard(page: Page, title: string, subtitle: string) {
  await page.evaluate(
    ({ title, subtitle }) => {
      document.getElementById("record-title-card")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "record-title-card";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:linear-gradient(145deg,#0b1220 0%,#172554 55%,#0f172a 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:Inter,system-ui,sans-serif;padding:48px;text-align:center;";
      overlay.innerHTML = `
        <div style="font-size:14px;letter-spacing:0.28em;text-transform:uppercase;opacity:0.72;margin-bottom:18px;">Fitdog Admin Center</div>
        <div style="font-size:clamp(36px,5vw,64px);font-weight:900;line-height:1.05;margin-bottom:14px;">${title}</div>
        <div style="font-size:clamp(18px,2.2vw,28px);opacity:0.82;max-width:900px;">${subtitle}</div>
      `;
      document.body.appendChild(overlay);
    },
    { title, subtitle }
  );
  await page.waitForTimeout(TITLE_PAUSE_MS);
  await page.evaluate(() => document.getElementById("record-title-card")?.remove());
}

async function showTabBanner(page: Page, text: string) {
  await page.evaluate((text) => {
    document.getElementById("record-tab-banner")?.remove();
    const banner = document.createElement("div");
    banner.id = "record-tab-banner";
    banner.style.cssText =
      "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483646;background:rgba(15,23,42,0.92);border:1px solid rgba(56,189,248,0.45);color:#fff;padding:12px 22px;border-radius:999px;font:700 18px/1.2 Inter,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.35);";
    banner.textContent = text;
    document.body.appendChild(banner);
  }, text);
  await page.waitForTimeout(TAB_BANNER_MS);
  await page.evaluate(() => document.getElementById("record-tab-banner")?.remove());
}

async function waitForDashboard(page: Page) {
  await page.waitForSelector(".admin-layout", { timeout: 90000 });
  await page.waitForTimeout(500);
}

async function loginDemoUser(page: Page, roleLabel: string) {
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#username", DEMO_EMAIL);
  await page.fill("#password", DEMO_PASSWORD);
  await showTitleCard(page, "Signing In", `${roleLabel} · ${DEMO_EMAIL}`);

  const loginResponse = await page.request.post(`${BASE_URL}/api/admin/login`, {
    data: { username: DEMO_EMAIL, password: DEMO_PASSWORD }
  });
  if (!loginResponse.ok()) {
    throw new Error(`Login failed for ${roleLabel}: ${await loginResponse.text()}`);
  }

  await page.goto(`${BASE_URL}/admin?board=staff&tab=demo_push`, { waitUntil: "domcontentloaded" });
  await waitForDashboard(page);
}

async function switchDemoRoleInUi(page: Page, roleLabel: string) {
  await page.click(".demo-role-switcher__trigger");
  await page.click(`.demo-role-switcher__item:has-text("${roleLabel}")`);
  await page.waitForLoadState("domcontentloaded");
  await waitForDashboard(page);
}

async function visitTab(page: Page, board: AdminBoardType, tab: AdminTab, roleLabel: string) {
  const label = getTabLabel(tab);
  await page.goto(`${BASE_URL}/admin?board=${board}&tab=${tab}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await waitForDashboard(page);
  await showTabBanner(page, `${roleLabel} · ${label}`);
  await page.waitForTimeout(PAGE_PAUSE_MS);
}

async function convertWebmToMp4(webmPath: string, mp4Path: string) {
  if (!hasFfmpeg()) return null;
  execSync(
    `ffmpeg -y -i "${webmPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`,
    { stdio: "inherit" }
  );
  return mp4Path;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } }
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "domcontentloaded" });
  await showTitleCard(
    page,
    "Role Panel Tour",
    "Fitdog Admin Center — login and every panel page for each user type"
  );

  let loggedIn = false;

  for (const [index, roleOption] of DEMO_ROLE_OPTIONS.entries()) {
    const { value: role, label: roleLabel } = roleOption;
    console.log(`Recording ${roleLabel} (${index + 1}/${DEMO_ROLE_OPTIONS.length})…`);

    if (!loggedIn) {
      await loginDemoUser(page, roleLabel);
      loggedIn = true;
      if (role !== "owner_admin") {
        await switchDemoRoleInUi(page, roleLabel);
      }
    } else {
      await showTitleCard(page, "Switching User", `Now viewing the ${roleLabel} panel`);
      await switchDemoRoleInUi(page, roleLabel);
    }

    await showTitleCard(page, roleLabel, "Panel overview and available pages");

    const boards: AdminBoardType[] =
      role === "owner_admin" || role === "manager_admin" ? ["staff", "lobby"] : ["staff"];

    for (const board of boards) {
      const tabs = tabsForRole(role, board);
      if (!tabs.length) continue;

      await showTitleCard(
        page,
        `${roleLabel} — ${board === "staff" ? "Staff Digital Whiteboard" : "Lobby Whiteboard"}`,
        `${tabs.length} pages`
      );

      for (const tab of tabs) {
        await visitTab(page, board, tab, roleLabel);
      }
    }
  }

  await showTitleCard(page, "Tour Complete", "Each role panel and page has been shown");

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) throw new Error("Playwright did not produce a video file.");

  const webmPath = await video.path();
  await rename(webmPath, FINAL_WEBM);

  const mp4Path = await convertWebmToMp4(FINAL_WEBM, FINAL_MP4);
  const finalPath = mp4Path ?? FINAL_WEBM;
  const sizeMb = ((await stat(finalPath)).size / (1024 * 1024)).toFixed(1);

  console.log(`\nVideo ready (${sizeMb} MB):\n${finalPath}\n`);
  if (!mp4Path) {
    console.log("Tip: install ffmpeg for MP4 export, or open the WebM in VLC/Chrome.\n");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
