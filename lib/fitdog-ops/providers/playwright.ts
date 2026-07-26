import { fitdogEmployeeEmail, fitdogEmployeePassword } from "@/lib/fitdog-ops/config";
import { decryptFitdogSession, encryptFitdogSession } from "@/lib/fitdog-ops/crypto";
import type { FitdogNotificationItem } from "@/lib/fitdog-ops/notifications-parse";
import { launchFitdogBrowser } from "@/lib/fitdog-ops/providers/browser";
import { FitdogNativeApiProvider } from "@/lib/fitdog-ops/providers/native-api";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";
import type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";

const HOME_URL = "https://app.fitdog.com/";
const DASHBOARD_URL = "https://app.fitdog.com/dashboard";

type CookieLike = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

async function loginAsEmployee(page: import("playwright-core").Page, email: string, password: string) {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });

  const employeeLink = page.getByText(/Sign in as an Instructor\/Employee/i);
  if ((await employeeLink.count()) > 0) {
    await employeeLink.first().click();
    await page.waitForTimeout(600);
  }

  await page.locator('input[type="email"], input[name="email"]').first().fill(email, { timeout: 15000 });
  await page.locator('input[type="password"]').first().fill(password, { timeout: 15000 });
  await Promise.all([
    page.waitForURL(/dashboard|employee|instructor/i, { timeout: 45000 }).catch(() => null),
    page.getByRole("button", { name: /sign in/i }).first().click()
  ]);

  if (/\/(login)?\/?$/i.test(page.url()) && (await page.locator('input[type="password"]').count()) > 0) {
    throw new Error("Fitdog authentication failed. Check employee credentials.");
  }
}

export class FitdogPlaywrightProvider implements FitdogIntegrationProvider {
  readonly mode = "playwright" as const;

  async sync(options: FitdogProviderSyncOptions): Promise<FitdogProviderSyncResult> {
    // Prefer the native activity-stream API — browser login is only a fallback.
    try {
      return await new FitdogNativeApiProvider().sync(options);
    } catch (nativeError) {
      // continue to browser fallback
      if (!fitdogEmployeeEmail() || !fitdogEmployeePassword()) throw nativeError;
    }

    const email = fitdogEmployeeEmail();
    const password = fitdogEmployeePassword();
    if (!email || !password) {
      throw new Error("FITDOG_EMPLOYEE_EMAIL and FITDOG_EMPLOYEE_PASSWORD are required for Playwright mode.");
    }

    const launched = await launchFitdogBrowser();
    const browser = launched.browser;
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    });

    let authExpired = false;
    let reauthenticated = false;
    const parseFailures: FitdogProviderSyncResult["parse_failures"] = [];

    try {
      const existing = decryptFitdogSession(options.encryptedSession);
      const cookies = Array.isArray(existing?.cookies) ? (existing!.cookies as CookieLike[]) : [];
      if (cookies.length) {
        await context.addCookies(cookies as never);
      }

      const page = await context.newPage();
      await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

      const needsLogin =
        !page.url().includes("/dashboard") ||
        (await page.locator('input[type="password"]').count().catch(() => 0)) > 0;

      if (needsLogin) {
        authExpired = cookies.length > 0;
        await loginAsEmployee(page, email, password);
        reauthenticated = true;
      }

      const notifications: FitdogNotificationItem[] = [];
      try {
        await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        const bell = page.getByText(/^Notifications$/i).first();
        if ((await bell.count().catch(() => 0)) > 0) {
          await bell.click({ timeout: 5000 }).catch(() => undefined);
          await page.waitForTimeout(800);
        }

        const scraped = await page.evaluate(() => {
          const roots = Array.from(
            document.querySelectorAll(
              '[class*="notification"], [data-testid*="notification"], [role="listitem"], li, article'
            )
          );
          const items: Array<{ text: string; time: string }> = [];
          for (const node of roots) {
            const text = (node.textContent || "").replace(/\s+/g, " ").trim();
            if (!text || text.length < 12 || text.length > 600) continue;
            if (
              !/(cancel|declin|vaccination|uploaded|payment|class|card|invoice|reservation|document|attended)/i.test(
                text
              )
            ) {
              continue;
            }
            const timeEl = node.querySelector("time, [class*='time'], [class*='date'], small");
            items.push({
              text,
              time: (timeEl?.textContent || "").replace(/\s+/g, " ").trim()
            });
            if (items.length >= 80) break;
          }
          const seen = new Set<string>();
          return items.filter((item) => {
            const key = item.text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });

        for (const [index, item] of scraped.entries()) {
          notifications.push({
            id: `dom-notif-${Buffer.from(item.text).toString("base64url").slice(0, 28)}-${index}`,
            text: item.text,
            detected_at: item.time || null,
            source_url: DASHBOARD_URL,
            raw: sanitizeFitdogPayload(item) as Record<string, unknown>
          });
        }
      } catch (error) {
        parseFailures?.push({
          source_url: `${DASHBOARD_URL}/notifications`,
          error: error instanceof Error ? error.message : "Notification feed scrape failed."
        });
      }

      const sessionCookies = await context.cookies();
      const encryptedSession = encryptFitdogSession({
        cookies: sessionCookies,
        saved_at: new Date().toISOString()
      });

      return {
        payments: [],
        services: [],
        notifications,
        records_scanned: notifications.length,
        parse_failures: parseFailures,
        checkpoint: { since: new Date().toISOString(), ...(options.checkpoint || {}) },
        encryptedSession,
        authExpired,
        reauthenticated
      };
    } finally {
      await context.close().catch(() => undefined);
      await launched.close();
    }
  }
}
