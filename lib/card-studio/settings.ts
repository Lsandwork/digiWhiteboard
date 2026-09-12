import { FITDOG_APPROVED_LOGO, FITDOG_APPROVED_WORDMARK } from "@/lib/card-studio/constants";
import type { CardStudioSettings } from "@/lib/card-studio/types";

export const DEFAULT_CARD_STUDIO_SETTINGS: CardStudioSettings = {
  defaultCardSize: "cr80",
  defaultDpi: 300,
  defaultSafeMm: 3,
  defaultBleedMm: 3,
  defaultPrinterId: "os-office",
  defaultTemplateId: null,
  verificationBaseUrl: "https://staff.ruffops.com",
  barcodeDefaultSymbology: "upca",
  printBridgeRequired: false
};

export const APPROVED_BRAND_ASSETS = [
  {
    key: "fitdog-logo-circle",
    name: "Fitdog Circle Badge",
    category: "logo",
    src: FITDOG_APPROVED_LOGO,
    approved: true
  },
  {
    key: "fitdog-wordmark",
    name: "Fitdog Wordmark",
    category: "logo",
    src: FITDOG_APPROVED_WORDMARK,
    approved: true
  }
] as const;
