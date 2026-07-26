import { fitdogEmployeeEmail, fitdogEmployeePassword } from "@/lib/fitdog-ops/config";
import { decryptFitdogSession, encryptFitdogSession } from "@/lib/fitdog-ops/crypto";
import { mapNotificationRows, type FitdogNotificationItem } from "@/lib/fitdog-ops/notifications-parse";
import { launchFitdogBrowser } from "@/lib/fitdog-ops/providers/browser";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";
import type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";
import type { FitdogPaymentTransaction, FitdogServiceRecord } from "@/lib/fitdog-ops/types";
const LOGIN_URL = "https://app.fitdog.com/login";
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

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["data", "results", "items", "transactions", "payments", "services", "reservations", "notifications", "alerts"]) {
    if (Array.isArray(obj[key])) return extractRows(obj[key]);
  }
  return [];
}

function mapPayment(row: Record<string, unknown>): FitdogPaymentTransaction | null {
  const id = String(row.id || row.transaction_id || row.payment_id || "").trim();
  if (!id) return null;
  return {
    fitdog_transaction_id: id,
    fitdog_owner_id: row.owner_id != null ? String(row.owner_id) : row.customer_id != null ? String(row.customer_id) : null,
    fitdog_dog_id: row.dog_id != null ? String(row.dog_id) : row.animal_id != null ? String(row.animal_id) : null,
    fitdog_reservation_id: row.reservation_id != null ? String(row.reservation_id) : null,
    fitdog_invoice_id: row.invoice_id != null ? String(row.invoice_id) : null,
    status: String(row.status || row.result || "unknown"),
    amount: Number(row.amount ?? row.amount_due ?? 0),
    currency: String(row.currency || "USD"),
    failure_reason: row.failure_reason != null ? String(row.failure_reason) : row.message != null ? String(row.message) : null,
    payment_method_brand: row.brand != null ? String(row.brand) : row.card_brand != null ? String(row.card_brand) : null,
    payment_method_last_four: row.last_four != null ? String(row.last_four) : row.last4 != null ? String(row.last4) : null,
    attempt_number: Number(row.attempt_number ?? row.attempts ?? 1),
    attempted_at: row.attempted_at != null ? String(row.attempted_at) : row.created_at != null ? String(row.created_at) : null,
    succeeded_at: row.succeeded_at != null ? String(row.succeeded_at) : row.paid_at != null ? String(row.paid_at) : null,
    source_url: row.url != null ? String(row.url) : row.source_url != null ? String(row.source_url) : `https://app.fitdog.com/dashboard/customer/${row.owner_id || row.customer_id || ""}/transactions`,
    raw: sanitizeFitdogPayload(row) as Record<string, unknown>
  };
}

function mapService(row: Record<string, unknown>): FitdogServiceRecord | null {
  const id = String(row.id || row.service_id || row.reservation_id || "").trim();
  if (!id) return null;
  return {
    fitdog_service_id: id,
    fitdog_reservation_id: row.reservation_id != null ? String(row.reservation_id) : id,
    fitdog_owner_id: row.owner_id != null ? String(row.owner_id) : null,
    fitdog_dog_id: row.dog_id != null ? String(row.dog_id) : null,
    owner_name: row.owner_name != null ? String(row.owner_name) : null,
    dog_name: row.dog_name != null ? String(row.dog_name) : null,
    service_name: String(row.service_name || row.name || row.type || "Service"),
    service_date: row.service_date != null ? String(row.service_date) : row.date != null ? String(row.date) : null,
    completed_at: row.completed_at != null ? String(row.completed_at) : row.attended_at != null ? String(row.attended_at) : null,
    attended: Boolean(row.attended ?? row.completed ?? /attended|completed/i.test(String(row.status || ""))),
    amount_due: Number(row.amount_due ?? row.balance ?? row.amount ?? 0),
    currency: String(row.currency || "USD"),
    covered_by_package: Boolean(row.covered_by_package || row.package_credit || row.used_package),
    covered_by_credit: Boolean(row.covered_by_credit || row.credit_applied),
    complimentary: Boolean(row.complimentary || row.comp || row.is_comp),
    discounted: Boolean(row.discounted || row.discount),
    waived: Boolean(row.waived || row.waiver),
    adjustment_notes: row.adjustment_notes != null ? String(row.adjustment_notes) : null,
    source_url: row.source_url != null ? String(row.source_url) : null,
    raw: sanitizeFitdogPayload(row) as Record<string, unknown>
  };
}

export class FitdogPlaywrightProvider implements FitdogIntegrationProvider {
  readonly mode = "playwright" as const;

  async sync(options: FitdogProviderSyncOptions): Promise<FitdogProviderSyncResult> {
    const email = fitdogEmployeeEmail();
    const password = fitdogEmployeePassword();
    if (!email || !password) {
      throw new Error("FITDOG_EMPLOYEE_EMAIL and FITDOG_EMPLOYEE_PASSWORD are required for Playwright mode.");
    }

    const launched = await launchFitdogBrowser();
    const browser = launched.browser;
    const context = await browser.newContext({
      userAgent: "FitdogOpsSync/1.0 (+https://staff.ruffops.com)"
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
        page.url().includes("/login") ||
        (await page.locator('input[type="password"]').count().catch(() => 0)) > 0;

      if (needsLogin) {
        authExpired = cookies.length > 0;
        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.fill('input[type="email"], input[name="email"], input[name="username"]', email);
        await page.fill('input[type="password"], input[name="password"]', password);
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
          page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
        ]);
        if (page.url().includes("/login")) {
          throw new Error("Fitdog authentication failed. Check employee credentials.");
        }
        reauthenticated = true;
      }

      const days = options.days ?? 30;
      const since = options.since || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const payments: FitdogPaymentTransaction[] = [];
      const services: FitdogServiceRecord[] = [];
      const notifications: FitdogNotificationItem[] = [];

      const endpoints = [
        `/api/payments?since=${encodeURIComponent(since)}`,
        `/api/transactions?since=${encodeURIComponent(since)}`,
        `/api/reservations?since=${encodeURIComponent(since)}&status=completed`,
        `/dashboard/api/payments?since=${encodeURIComponent(since)}`,
        `/api/notifications?since=${encodeURIComponent(since)}`,
        `/api/alerts?since=${encodeURIComponent(since)}`,
        `/dashboard/api/notifications?since=${encodeURIComponent(since)}`,
        `/api/v1/notifications?since=${encodeURIComponent(since)}`
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await page.request.get(`https://app.fitdog.com${endpoint}`);
          if (!response.ok()) continue;
          const text = await response.text();
          const json = parseJsonSafe(text);
          if (!json) {
            parseFailures?.push({
              source_url: `https://app.fitdog.com${endpoint}`,
              error: "Unable to parse Fitdog response as JSON.",
              sanitized: { preview: text.slice(0, 500) }
            });
            continue;
          }
          const rows = extractRows(json);
          for (const row of rows) {
            if (/notification|alert/i.test(endpoint)) {
              notifications.push(...mapNotificationRows([row]));
            } else if (/payment|transaction|charge/i.test(endpoint)) {
              const mapped = mapPayment(row);
              if (mapped) payments.push(mapped);
            } else {
              const mapped = mapService(row);
              if (mapped) services.push(mapped);
            }
          }
        } catch (error) {
          parseFailures?.push({
            source_url: `https://app.fitdog.com${endpoint}`,
            error: error instanceof Error ? error.message : "Endpoint fetch failed."
          });
        }
      }

      // Notification feed DOM scrape (bell dropdown / notifications page).
      if (!notifications.length) {
        try {
          await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
          const bell = page.locator(
            '[aria-label*="notification" i], [aria-label*="alert" i], button:has-text("Notifications"), [class*="notification"] button, header button'
          ).first();
          if ((await bell.count().catch(() => 0)) > 0) {
            await bell.click({ timeout: 5000 }).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 800));
          } else {
            await page.goto(`${DASHBOARD_URL}/notifications`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
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
                !/(cancel|declin|vaccination|uploaded|payment|class|card|invoice|reservation|document)/i.test(
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
            // Deduplicate near-identical rows
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
              source_url: "https://app.fitdog.com/dashboard",
              raw: sanitizeFitdogPayload(item) as Record<string, unknown>
            });
          }
        } catch (error) {
          parseFailures?.push({
            source_url: `${DASHBOARD_URL}/notifications`,
            error: error instanceof Error ? error.message : "Notification feed scrape failed."
          });
        }
      }

      // DOM fallback: harvest transaction table rows when APIs are unavailable.
      if (!payments.length) {
        try {
          await page.goto(`${DASHBOARD_URL}/transactions`, { waitUntil: "domcontentloaded", timeout: 45000 });
          const rows = await page.locator("table tbody tr").evaluateAll((nodes) =>
            nodes.slice(0, 200).map((node) => {
              const cells = Array.from(node.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
              const link = node.querySelector("a[href]")?.getAttribute("href") || "";
              return { cells, link };
            })
          );
          for (const [index, row] of rows.entries()) {
            const cells = row.cells;
            const amountMatch = cells.join(" ").match(/\$?\d+(?:\.\d{2})?/);
            const failed = /fail|declin|expired|missing|error/i.test(cells.join(" "));
            if (!failed && !/unpaid|due|outstanding/i.test(cells.join(" "))) continue;
            payments.push({
              fitdog_transaction_id: `dom-${Buffer.from(row.link || cells.join("|")).toString("base64url").slice(0, 24)}-${index}`,
              status: failed ? "failed" : "unpaid",
              amount: amountMatch ? Number(amountMatch[0].replace("$", "")) : 0,
              currency: "USD",
              failure_reason: failed ? cells.find((cell) => /fail|declin|expired|missing|error/i.test(cell)) || "Payment failed" : "Outstanding balance",
              attempted_at: new Date().toISOString(),
              source_url: row.link ? (row.link.startsWith("http") ? row.link : `https://app.fitdog.com${row.link}`) : null,
              raw: sanitizeFitdogPayload(row) as Record<string, unknown>
            });
          }
        } catch (error) {
          parseFailures?.push({
            source_url: `${DASHBOARD_URL}/transactions`,
            error: error instanceof Error ? error.message : "DOM scrape failed."
          });
        }
      }

      const sessionCookies = await context.cookies();
      const encryptedSession = encryptFitdogSession({
        cookies: sessionCookies,
        saved_at: new Date().toISOString()
      });

      return {
        payments,
        services,
        notifications,
        records_scanned: payments.length + services.length + notifications.length,
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
