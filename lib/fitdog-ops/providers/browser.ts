import path from "node:path";
import type { Browser } from "playwright-core";

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.LAMBDA_TASK_ROOT
  );
}

type SparticuzChromium = {
  args: string[];
  executablePath: (input?: string) => Promise<string>;
};

async function loadSparticuzChromium(): Promise<SparticuzChromium> {
  const mod = (await import("@sparticuz/chromium")) as unknown as {
    default?: SparticuzChromium;
  } & Partial<SparticuzChromium>;
  const chromium = mod.default ?? mod;
  if (typeof chromium.executablePath !== "function" || !Array.isArray(chromium.args)) {
    throw new Error("Unable to load @sparticuz/chromium for Fitdog sync.");
  }
  return {
    args: chromium.args,
    executablePath: chromium.executablePath.bind(chromium)
  };
}

/**
 * Launch Chromium for Fitdog sync.
 * - Local/dev: playwright-core (or playwright) with local browser if installed
 * - Vercel/Lambda: playwright-core + @sparticuz/chromium
 */
export async function launchFitdogBrowser(): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const serverless = isServerlessRuntime();

  if (serverless) {
    const [{ chromium: playwrightChromium }, chromium] = await Promise.all([
      import("playwright-core"),
      loadSparticuzChromium()
    ]);
    const executablePath = await chromium.executablePath();
    if (!executablePath) {
      throw new Error("Serverless Chromium executable was not found for Fitdog sync.");
    }
    process.env.LD_LIBRARY_PATH = [path.dirname(executablePath), process.env.LD_LIBRARY_PATH || ""]
      .filter(Boolean)
      .join(":");

    const browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true
    });
    return {
      browser,
      close: async () => {
        await browser.close().catch(() => undefined);
      }
    };
  }

  // Prefer playwright-core, fall back to full playwright for local tooling.
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ headless: true });
    return {
      browser,
      close: async () => {
        await browser.close().catch(() => undefined);
      }
    };
  } catch {
    try {
      const playwright = await import("playwright");
      const browser = await playwright.chromium.launch({ headless: true });
      return {
        browser: browser as unknown as Browser,
        close: async () => {
          await browser.close().catch(() => undefined);
        }
      };
    } catch {
      throw new Error(
        "Playwright is not available in this runtime. Install playwright-core and Chromium for Fitdog sync."
      );
    }
  }
}
