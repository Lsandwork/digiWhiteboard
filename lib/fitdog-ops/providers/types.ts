import type { FitdogIntegrationMode, FitdogSyncMode, FitdogSyncSnapshot } from "@/lib/fitdog-ops/types";

export type FitdogProviderSyncOptions = {
  mode: FitdogSyncMode;
  since?: string | null;
  days?: number;
  checkpoint?: Record<string, unknown>;
  encryptedSession?: Record<string, unknown>;
};

export type FitdogProviderSyncResult = FitdogSyncSnapshot & {
  encryptedSession?: Record<string, unknown>;
  authExpired?: boolean;
  reauthenticated?: boolean;
};

export interface FitdogIntegrationProvider {
  readonly mode: FitdogIntegrationMode;
  sync(options: FitdogProviderSyncOptions): Promise<FitdogProviderSyncResult>;
}
