import { DEFAULT_OS_CAPABILITIES, UNSUPPORTED } from "@/lib/card-studio/printers/adapter";
import type { CalibrationProfile, PrinterAdapter, PrinterInfo, PrintPayload } from "@/lib/card-studio/printers/adapter";
import type { PrintAdapterResult } from "@/lib/card-studio/types";

export const OFFICE_PRINTER_ID = "os-office";

export const OFFICE_PRINTER: PrinterInfo = {
  id: OFFICE_PRINTER_ID,
  name: "This computer (normal printer)",
  manufacturer: "OS",
  model: "Installed system printer",
  connection: "os",
  adapterId: "generic-os",
  nativeIntegration: false
};

/**
 * Generic OS driver adapter.
 * Meantime path: the browser opens the operating-system print dialog so any
 * installed office printer can print CR80 artwork at actual size.
 * This is not a native ID-card SDK and does not claim USB control.
 */
export class GenericOsPrinterAdapter implements PrinterAdapter {
  id = "generic-os";
  label = "OS Driver Printing";
  manufacturer = "Generic";
  installed = true;

  async discover(): Promise<PrinterInfo[]> {
    return [{ ...OFFICE_PRINTER }];
  }

  async connect() {}
  async disconnect() {}

  async getStatus(printer: PrinterInfo) {
    return {
      code: "online" as const,
      message: `OS Driver Mode — “${printer.name}” prints through this computer’s print dialog. Choose any installed printer. This is not a native ID-card adapter.`,
      ribbonRemainingPct: null,
      cardStockRemaining: null,
      warnings: [
        "OS DRIVER MODE",
        "Artwork is CR80 actual size (3.375 in × 2.125 in) on letter/A4 with crop marks unless the driver supports custom card stock."
      ]
    };
  }

  async getCapabilities() {
    return {
      ...DEFAULT_OS_CAPABILITIES,
      duplex: true,
      automaticDuplex: false,
      manualFlip: true,
      osDriver: true,
      nativeIntegration: false
    };
  }

  async getPrinterInfo(printer: PrinterInfo) {
    return printer;
  }

  async print(_printer: PrinterInfo, payload: PrintPayload): Promise<PrintAdapterResult> {
    return {
      status: "unknown",
      message:
        "Artwork is ready for this computer’s print dialog. The card is NOT marked issued until you confirm the physical print.",
      raw: {
        jobId: payload.jobId,
        mode: payload.mode,
        delivery: "os-print-dialog",
        paper: "letter-with-cr80-crop-marks"
      }
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
    return { remainingPct: null, message: "Ribbon status is not provided by a normal office printer driver." };
  }
  async getCardStatus() {
    return { remaining: null, message: "Card stock status is not provided by a normal office printer driver." };
  }
  async configure(): Promise<PrintAdapterResult> {
    return { status: "success", message: "OS driver preferences stored in the printer profile." };
  }
  async calibrate(_printer: PrinterInfo, profile: CalibrationProfile): Promise<PrintAdapterResult> {
    return { status: "success", message: "Calibration saved for OS driver profile.", raw: { ...profile } };
  }
}

export const genericOsAdapter = new GenericOsPrinterAdapter();
