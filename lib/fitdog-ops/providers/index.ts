import { fitdogApiBaseUrl, fitdogApiToken, fitdogEnvMode } from "@/lib/fitdog-ops/config";
import { FitdogApiProvider } from "@/lib/fitdog-ops/providers/api";
import { FitdogNativeApiProvider } from "@/lib/fitdog-ops/providers/native-api";
import { FitdogPlaywrightProvider } from "@/lib/fitdog-ops/providers/playwright";
import type { FitdogIntegrationProvider } from "@/lib/fitdog-ops/providers/types";
import type { FitdogIntegrationMode } from "@/lib/fitdog-ops/types";

export function getFitdogProvider(mode?: FitdogIntegrationMode): FitdogIntegrationProvider {
  const resolved = mode || fitdogEnvMode();
  if (resolved === "playwright") return new FitdogPlaywrightProvider();
  if (resolved === "webhook") {
    // Webhook mode still supports pull reconciliation via native/API when configured.
    if (fitdogApiBaseUrl() && fitdogApiToken()) return new FitdogApiProvider();
    return new FitdogNativeApiProvider();
  }
  // Default "api" mode uses Fitdog's real employee activity-stream (OAuth password grant).
  // Legacy FITDOG_API_BASE_URL + token remains available when both are set.
  if (fitdogApiBaseUrl() && fitdogApiToken()) return new FitdogApiProvider();
  return new FitdogNativeApiProvider();
}

export type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";
export { normalizeFitdogWebhookPayload } from "@/lib/fitdog-ops/providers/webhook";
