/**
 * Safe Fitdog connectivity probe — does NOT bypass CAPTCHA/MFA.
 * Records whether login page / MFA / report UI is reachable.
 */
import { chromium } from "playwright-core";
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

async function patchChecklist(patch: Record<string, unknown>) {
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const client = new Client({
    connectionString: `postgresql://postgres.tzkocaucqtmmnrttxira:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const { rows } = await client.query(`select value from route_generator_settings where key='feature_checklist'`);
  const next = { ...(rows[0]?.value as object), ...patch, updated_at: new Date().toISOString() };
  await client.query(`update route_generator_settings set value=$1::jsonb, updated_at=now() where key='feature_checklist'`, [
    JSON.stringify(next)
  ]);
  const connStatus =
    patch.fitdog_probe_status === "connected"
      ? "connected"
      : patch.fitdog_probe_status === "waiting_for_authentication"
        ? "expired"
        : "error";
  await client.query(
    `update route_report_connections
     set status=$1, last_error=$2, updated_at=now()
     where provider='fitdog'`,
    [connStatus, String(patch.fitdog_probe_detail || "").slice(0, 500)]
  );
  await client.end();
}

async function main() {
  const email = process.env.FITDOG_EMPLOYEE_EMAIL?.trim();
  const password = process.env.FITDOG_EMPLOYEE_PASSWORD?.trim();
  if (!email || !password) {
    await patchChecklist({
      fitdog_connection_tested: false,
      fitdog_probe_status: "error",
      fitdog_probe_detail: "Missing FITDOG_EMPLOYEE_EMAIL/PASSWORD"
    });
    throw new Error("Missing Fitdog employee credentials");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  }).catch(async () => {
    // fallback to channel
    return chromium.launch({ headless: true, channel: "chrome", args: ["--no-sandbox"] });
  });

  const page = await browser.newPage();
  let detail = "";
  let status: "connected" | "waiting_for_authentication" | "error" = "error";

  try {
    await page.goto("https://app.fitdog.com", { waitUntil: "domcontentloaded", timeout: 45000 });
    const html = await page.content();
    const title = await page.title();
    const lower = (html + " " + title).toLowerCase();

    if (/captcha|recaptcha|hcaptcha|cf-challenge|challenge-platform/.test(lower)) {
      status = "waiting_for_authentication";
      detail = "CAPTCHA/bot challenge detected — Super Admin must reconnect interactively. Not bypassed.";
    } else if (/mfa|two.factor|2fa|verification code|authenticator/.test(lower)) {
      status = "waiting_for_authentication";
      detail = "MFA challenge detected — Super Admin must reconnect interactively.";
    } else {
      // Attempt to find login fields only; stop if challenge appears after submit.
      const emailSel = 'input[type="email"], input[name="email"], input[name="username"], input#email';
      const passSel = 'input[type="password"], input[name="password"], input#password';
      const hasEmail = await page.locator(emailSel).first().count();
      const hasPass = await page.locator(passSel).first().count();
      if (!hasEmail || !hasPass) {
        status = "waiting_for_authentication";
        detail = `Login form not automatically mapable (title="${title}"). Manual Super Admin reconnect required.`;
      } else {
        await page.locator(emailSel).first().fill(email);
        await page.locator(passSel).first().fill(password);
        const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log"), button:has-text("Sign")').first();
        if (await submit.count()) await submit.click({ timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(4000);
        const after = (await page.content()).toLowerCase();
        if (/captcha|recaptcha|hcaptcha|mfa|two.factor|2fa|verification code/.test(after)) {
          status = "waiting_for_authentication";
          detail = "Post-login CAPTCHA/MFA detected — not bypassed. Super Admin reconnect required.";
        } else if (/pickup|drop-off|dropoff|routes report|reservation/.test(after)) {
          status = "connected";
          detail = "Appears logged in with report UI signals. Live report selectors still need Super Admin mapping.";
        } else {
          status = "waiting_for_authentication";
          detail = `Login result unclear (url=${page.url()}). Keeping fixture mode.`;
        }
      }
    }
  } catch (error) {
    status = "error";
    detail = error instanceof Error ? error.message.slice(0, 400) : "probe failed";
  } finally {
    await browser.close().catch(() => undefined);
  }

  await patchChecklist({
    fitdog_connection_tested: status === "connected",
    fitdog_probe_status: status,
    fitdog_probe_detail: detail,
    fitdog_probe_at: new Date().toISOString()
  });

  console.log(JSON.stringify({ ok: status !== "error", status, detail }, null, 2));
  if (status === "error") process.exit(1);
}

void main();
