import { after } from "next/server";
import { ingestGingrWebhook } from "@/lib/integrations/gingr/webhooks/process";
import type { GingrWebhookPayload } from "@/lib/integrations/gingr/types";
import { isRufflyEnabled } from "@/lib/ruffly/flags";

/**
 * Gingr only supports one webhook URL. DigiBoard owns that URL
 * (`/api/gingr/webhook`) and fans verified events into Ruffly without
 * changing the Gingr UI configuration.
 */
export function fanoutVerifiedGingrWebhookToRuffly(payload: GingrWebhookPayload) {
  if (!isRufflyEnabled() && process.env.RUFFLY_WEBHOOKS_ALWAYS_ACCEPT !== "true") {
    return;
  }

  after(async () => {
    try {
      await ingestGingrWebhook(payload);
    } catch (error) {
      console.error("[gingr-webhook] Ruffly fanout failed", error);
    }
  });
}
