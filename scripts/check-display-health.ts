import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  LOBBY_CAST_NAMESPACE,
  getGoogleCastAppId,
  isGoogleCastConfigured
} from "../lib/lobby/google-cast";
import { buildLobbyTvCastUrl, buildStaffTvCastUrl } from "../lib/lobby/tv-cast";

loadEnvConfig(process.cwd());

type CheckStatus = "pass" | "warn" | "fail";

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail: string;
};

const results: CheckResult[] = [];

function resolveBaseUrl() {
  const candidate = process.env.TEST_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return candidate.replace(/\/$/, "");
}

function record(name: string, status: CheckStatus, detail: string) {
  results.push({ name, status, detail });
}

function readCastReceiverHtml() {
  return readFileSync(join(process.cwd(), "public", "cast-receiver.html"), "utf8");
}

function checkChromecastEnv() {
  const appId = getGoogleCastAppId();

  if (isGoogleCastConfigured()) {
    record("Chromecast app ID", "pass", `NEXT_PUBLIC_GOOGLE_CAST_APP_ID is set (${appId}).`);
    return;
  }

  record(
    "Chromecast app ID",
    "warn",
    "NEXT_PUBLIC_GOOGLE_CAST_APP_ID is not set. Native Chromecast will not load the whiteboard; use Wireless Display or copy the TV URL instead."
  );
}

function checkLobbyDisplayTokenEnv() {
  const token = process.env.LOBBY_DISPLAY_TOKEN?.trim();

  if (!token) {
    record("Lobby display token", "pass", "LOBBY_DISPLAY_TOKEN is not required (open lobby APIs).");
    return;
  }

  record(
    "Lobby display token",
    "pass",
    "LOBBY_DISPLAY_TOKEN is set. Lobby TVs must open /display/lobby-whiteboard with ?token=… or use the embedded server token."
  );
}

function checkCastReceiverAsset() {
  try {
    const html = readCastReceiverHtml();
    const hasNamespace = html.includes(LOBBY_CAST_NAMESPACE);
    const hasReceiverSdk = html.includes("cast_receiver_framework.js");

    if (hasNamespace && hasReceiverSdk) {
      record("Cast receiver page", "pass", "public/cast-receiver.html includes the Fitdog namespace and Cast receiver SDK.");
      return;
    }

    record(
      "Cast receiver page",
      "fail",
      "public/cast-receiver.html is missing the Fitdog cast namespace or receiver SDK."
    );
  } catch (error) {
    record(
      "Cast receiver page",
      "fail",
      error instanceof Error ? error.message : "Unable to read public/cast-receiver.html."
    );
  }
}

function checkCastUrls() {
  const baseUrl = resolveBaseUrl();
  const token = process.env.LOBBY_DISPLAY_TOKEN?.trim();
  const lobbyUrl = buildLobbyTvCastUrl(`${baseUrl}/lobby/checkouts`, token);
  const staffUrl = buildStaffTvCastUrl(`${baseUrl}/`, token);

  if (!lobbyUrl.includes("/display/lobby-whiteboard")) {
    record("Lobby cast URL", "fail", `Unexpected lobby cast URL: ${lobbyUrl}`);
  } else {
    record("Lobby cast URL", "pass", lobbyUrl);
  }

  if (!staffUrl.includes("/display/staff-whiteboard")) {
    record("Staff cast URL", "fail", `Unexpected staff cast URL: ${staffUrl}`);
  } else {
    record("Staff cast URL", "pass", staffUrl);
  }
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const text = await response.text();
  return { response, text };
}

async function checkHttpEndpoint(name: string, path: string, expectedInBody?: RegExp) {
  const baseUrl = resolveBaseUrl();

  try {
    const { response, text } = await fetchText(`${baseUrl}${path}`);
    if (!response.ok) {
      record(name, "fail", `${path} returned HTTP ${response.status}.`);
      return;
    }

    if (expectedInBody && !expectedInBody.test(text)) {
      record(name, "fail", `${path} returned ${response.status} but did not include expected content.`);
      return;
    }

    record(name, "pass", `${path} returned HTTP ${response.status}.`);
  } catch (error) {
    record(
      name,
      "fail",
      `${path} is unreachable at ${baseUrl}. Start the app with \`npm run dev\` or set TEST_BASE_URL to production. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

async function checkDisplaySyncApi() {
  const baseUrl = resolveBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/display/sync`, { cache: "no-store" });
    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      record("Display sync API", "fail", `/api/display/sync returned HTTP ${response.status}.`);
      return;
    }

    const required = ["display_content_revision", "cast_hard_reload_nonce", "build_id"];
    const missing = required.filter((key) => typeof body[key] === "undefined");
    if (missing.length) {
      record("Display sync API", "fail", `/api/display/sync is missing fields: ${missing.join(", ")}`);
      return;
    }

    record(
      "Display sync API",
      "pass",
      `revision=${String(body.display_content_revision)}, build=${String(body.build_id)}`
    );
  } catch (error) {
    record(
      "Display sync API",
      "fail",
      `/api/display/sync is unreachable. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

async function checkHeartbeatApi() {
  const baseUrl = resolveBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/displays/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        deviceId: `health-check-${Date.now()}`,
        displayType: "lobby_whiteboard",
        route: "/display/lobby-whiteboard",
        status: "online",
        wakeLockStatus: "active",
        lastDataAt: new Date().toISOString()
      })
    });

    const body = (await response.json()) as { ok?: boolean; sync?: unknown; commands?: unknown[] };
    if (!response.ok || !body.ok || !body.sync || !Array.isArray(body.commands)) {
      const hint =
        response.status === 500
          ? " Run `npm run db:push` to apply migration 024_display_keeper.sql if display_devices is missing."
          : "";
      record(
        "Cast Keeper heartbeat",
        "fail",
        `/api/displays/heartbeat returned an invalid payload (HTTP ${response.status}).${hint}`
      );
      return;
    }

    record("Cast Keeper heartbeat", "pass", "Heartbeat accepted and returned sync state + commands.");
  } catch (error) {
    record(
      "Cast Keeper heartbeat",
      "fail",
      `/api/displays/heartbeat is unreachable. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

async function checkLiveBoardApi() {
  const baseUrl = resolveBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/live-board`, { cache: "no-store" });
    const body = (await response.json()) as { error?: string; checking_in?: unknown[]; checking_out?: unknown[] };

    if (!response.ok || body.error || !Array.isArray(body.checking_in) || !Array.isArray(body.checking_out)) {
      record("Staff board API", "fail", `/api/live-board failed (HTTP ${response.status}).`);
      return;
    }

    record(
      "Staff board API",
      "pass",
      `checking_in=${body.checking_in.length}, checking_out=${body.checking_out.length}`
    );
  } catch (error) {
    record(
      "Staff board API",
      "fail",
      `/api/live-board is unreachable. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

async function checkLobbyCheckoutApi() {
  const baseUrl = resolveBaseUrl();
  const token = process.env.TEST_LOBBY_DISPLAY_TOKEN?.trim() || process.env.LOBBY_DISPLAY_TOKEN?.trim();
  const headers: Record<string, string> = {};
  if (token) headers["x-lobby-display-token"] = token;

  try {
    const response = await fetch(`${baseUrl}/api/lobby/checkouts?fast=1`, {
      cache: "no-store",
      headers
    });
    const body = (await response.json()) as { error?: string; queue?: unknown[] };

    if (response.status === 401 && !token) {
      record(
        "Lobby checkout API",
        "warn",
        "Production requires LOBBY_DISPLAY_TOKEN. Set TEST_LOBBY_DISPLAY_TOKEN in your shell to verify the secured lobby API."
      );
      return;
    }

    if (!response.ok || body.error || !Array.isArray(body.queue)) {
      const hint = token
        ? "Check LOBBY_DISPLAY_TOKEN / TEST_LOBBY_DISPLAY_TOKEN matches production."
        : "Lobby checkout API returned an error.";
      record("Lobby checkout API", "fail", `/api/lobby/checkouts?fast=1 failed (HTTP ${response.status}). ${hint}`);
      return;
    }

    record("Lobby checkout API", "pass", `queue=${body.queue.length}`);
  } catch (error) {
    record(
      "Lobby checkout API",
      "fail",
      `/api/lobby/checkouts is unreachable. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

function printChromecastSetupGuide() {
  const baseUrl = resolveBaseUrl();
  const needsCastSetup = !isGoogleCastConfigured();

  if (!needsCastSetup) return;

  console.log("\nChromecast setup (optional, for native Cast button):");
  console.log("1. Open the Google Cast SDK Developer Console and register a Custom Receiver app.");
  console.log(`2. Set the receiver URL to ${baseUrl}/cast-receiver.html`);
  console.log("3. Add NEXT_PUBLIC_GOOGLE_CAST_APP_ID=<your-app-id> to .env.local and your deploy env (Vercel).");
  console.log("4. Redeploy, then cast from Chrome using the Chromecast option.");
  console.log("   Until then, Wireless Display and Copy TV Link still work.");
}

function printSummary() {
  const icon: Record<CheckStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL"
  };

  console.log(`\nFitdog display health check — ${resolveBaseUrl()}\n`);

  for (const result of results) {
    console.log(`${icon[result.status].padEnd(4)} ${result.name}`);
    console.log(`     ${result.detail}`);
  }

  const failed = results.filter((result) => result.status === "fail").length;
  const warned = results.filter((result) => result.status === "warn").length;
  const passed = results.filter((result) => result.status === "pass").length;

  console.log(`\nSummary: ${passed} passed, ${warned} warnings, ${failed} failed.`);

  printChromecastSetupGuide();
}

async function run() {
  checkChromecastEnv();
  checkLobbyDisplayTokenEnv();
  checkCastReceiverAsset();
  checkCastUrls();

  await checkHttpEndpoint("Lobby display page", "/display/lobby-whiteboard", /lobby|cast|whiteboard|Loading/i);
  await checkHttpEndpoint("Staff display page", "/display/staff-whiteboard", /staff|cast|whiteboard|Loading/i);
  await checkHttpEndpoint("Cast receiver (hosted)", "/cast-receiver.html", /Fitdog Cast Receiver/);
  await checkDisplaySyncApi();
  await checkHeartbeatApi();
  await checkLiveBoardApi();
  await checkLobbyCheckoutApi();

  printSummary();

  if (results.some((result) => result.status === "fail")) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
