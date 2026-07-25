import { fitdogApiBaseUrl, fitdogApiToken, fitdogEnvMode } from "@/lib/fitdog-ops/config";
import { FitdogApiProvider } from "@/lib/fitdog-ops/providers/api";
import { FitdogPlaywrightProvider } from "@/lib/fitdog-ops/providers/playwright";
import type { FitdogIntegrationProvider } from "@/lib/fitdog-ops/providers/types";
import type { FitdogIntegrationMode } from "@/lib/fitdog-ops/types";

export function getFitdogProvider(mode?: FitdogIntegrationMode): FitdogIntegrationProvider {
  const resolved = mode || fitdogEnvMode();
  if (resolved === "api") return new FitdogApiProvider();
  if (resolved === "webhook") {
    // Webhook mode still supports pull reconciliation via API when configured, else Playwright.
    if (fitdogApiBaseUrl() && fitdogApiToken()) return new FitdogApiProvider();
    return new FitdogPlaywrightProvider();
  }
  return new FitdogPlaywrightProvider();
}

export type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";
export { normalizeFitdogWebhookPayload } from "@/lib/fitdog-ops/providers/webhook";
