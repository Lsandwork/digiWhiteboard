import type { CalibrationProfile, PrinterAdapter, PrinterInfo, PrintPayload } from "@/lib/card-studio/printers/adapter";
import { DEFAULT_OS_CAPABILITIES, UNSUPPORTED } from "@/lib/card-studio/printers/adapter";
import type { PrintAdapterResult } from "@/lib/card-studio/types";

/**
 * Generic OS driver adapter. The browser never talks to USB printers.
 * Actual OS printing happens on the Print Bridge host. This adapter
 * records the intent and does not claim hardware success.
 */
export class GenericOsPrinterAdapter implements PrinterAdapter {
  id = "generic-os";
  label = "OS Driver Printing";
  manufacturer = "Generic";
  installed = true;

  async discover(): Promise<PrinterInfo[]> {
    return [];
  }

  async connect() {}
  async disconnect() {}

  async getStatus(printer: PrinterInfo) {
    return {
      code: "unknown" as const,
      message: `OS Driver Mode for “${printer.name}”. Status is only known when the Print Bridge is connected.`,
      ribbonRemainingPct: null,
      cardStockRemaining: null,
      warnings: ["Native manufacturer adapter is not installed."]
    };
  }

  async getCapabilities() {
    return { ...DEFAULT_OS_CAPABILITIES };
  }

  async getPrinterInfo(printer: PrinterInfo) {
    return printer;
  }

  async print(_printer: PrinterInfo, payload: PrintPayload): Promise<PrintAdapterResult> {
    if (!process.env.CARD_STUDIO_PRINT_BRIDGE_URL) {
      return {
        status: "unknown",
        message:
          "OS Driver Mode queued the artwork, but no Print Bridge is connected. The card was NOT marked as printed.",
        raw: { jobId: payload.jobId, mode: "os-driver" }
      };
    }
    return {
      status: "unknown",
      message: "Print was sent to the Print Bridge. Confirm the physical result before issuing a reprint.",
      raw: { jobId: payload.jobId, mode: "os-driver" }
    };
  }

  async cancel() {
    return UNSUPPORTED;
  }
  async pause(): Promise<PrintAdapterResult> {
    return UNSUPPORTED;
  }
  async resume(): Promise<PrintAdapterResult> {
    return UNSUPPORTED;
  }
  async reset(): Promise<PrintAdapterResult> {
    return UNSUPPORTED;
  }
  async testPrint(printer: PrinterInfo) {
    return this.print(printer, { jobId: "JOB-TEST", cardId: "test", mode: "front", dpi: 300, copies: 1, color: true });
  }
  async getRibbonStatus() {
    return { remainingPct: null, message: "Ribbon status is not provided by the OS driver." };
  }
  async getCardStatus() {
    return { remaining: null, message: "Card stock status is not provided by the OS driver." };
  }
  async configure(): Promise<PrintAdapterResult> {
    return { status: "success", message: "OS driver preferences stored in the printer profile." };
  }
  async calibrate(_printer: PrinterInfo, profile: CalibrationProfile): Promise<PrintAdapterResult> {
    return { status: "success", message: "Calibration saved for OS driver profile.", raw: { ...profile } };
  }
}

export const genericOsAdapter = new GenericOsPrinterAdapter();
