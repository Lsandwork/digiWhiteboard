/**
 * Capture real production screenshots for Help Center visual guides.
 *
 *   RECORD_BASE_URL=https://staff.ruffops.com npx tsx scripts/capture-help-screenshots.ts
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { DEMO_PASSWORD } from "../lib/demo/constants";

const BASE_URL = (process.env.RECORD_BASE_URL ?? "https://staff.ruffops.com").replace(/\/$/, "");
const OUT_DIR = path.join(process.cwd(), "public/help");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Public staff whiteboard
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, "staff-whiteboard.png"), fullPage: false });
  console.log("saved staff-whiteboard.png");

  // Public lobby whiteboard
  await page.goto(`${BASE_URL}/lobby/checkouts`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT_DIR, "lobby-whiteboard.png"), fullPage: false });
  console.log("saved lobby-whiteboard.png");

  // Demo admin login → Push Notices / CAST-TV (real admin UI)
  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1000);
  const userField = page.locator('input[type="text"], input[name="username"], input[autocomplete="username"]').first();
  const passwordField = page.locator('input[type="password"]').first();
  await userField.fill("demo-admin@demo.com");
  await passwordField.fill(DEMO_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/admin/, { timeout: 30_000 }).catch(() => null),
    page.locator('button[type="submit"]').first().click()
  ]);
  await page.waitForTimeout(2500);
  console.log("post-login url", page.url());

  if (!page.url().includes("/admin/login")) {
    await page.goto(`${BASE_URL}/admin?board=staff&tab=push_notices`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, "push-notices.png"), fullPage: false });
    console.log("saved push-notices.png");

    await page.goto(`${BASE_URL}/admin?board=marketing&tab=cast_tv`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000
    });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, "cast-tv-marketing.png"), fullPage: false });
    console.log("saved cast-tv-marketing.png");
  } else {
    console.warn("demo login failed — skipping authenticated help screenshots");
  }

  await browser.close();
  console.log("help screenshots: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
