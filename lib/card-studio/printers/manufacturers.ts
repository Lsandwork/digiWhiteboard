import type { PrinterAdapter } from "@/lib/card-studio/printers/adapter";
import { notInstalled, UNSUPPORTED } from "@/lib/card-studio/printers/adapter";
import type { PrintAdapterResult } from "@/lib/card-studio/types";

function stub(id: string, manufacturer: string): PrinterAdapter {
  return {
    id,
    label: `${manufacturer} Adapter`,
    manufacturer,
    installed: false,
    async discover() {
      return [];
    },
    async connect() {},
    async disconnect() {},
    async getStatus() {
      return {
        code: "adapter_not_installed",
        message: `${manufacturer} native adapter is not installed.`,
        ribbonRemainingPct: null,
        cardStockRemaining: null,
        warnings: ["Adapter Not Installed"]
      };
    },
    async getCapabilities() {
      return {
        color: false,
        monochrome: false,
        duplex: false,
        automaticDuplex: false,
        manualFlip: true,
        edgeToEdge: false,
        resolution: 300,
        uv: false,
        lamination: false,
        magneticStripe: false,
        smartCard: false,
        contactless: false,
        usb: false,
        ethernet: false,
        wifi: false,
        osDriver: true,
        nativeIntegration: false
      };
    },
    async getPrinterInfo(printer) {
      return printer;
    },
    async print(): Promise<PrintAdapterResult> {
      return notInstalled(manufacturer);
    },
    async cancel() {
      return notInstalled(manufacturer);
    },
    async pause() {
      return UNSUPPORTED;
    },
    async resume() {
      return UNSUPPORTED;
    },
    async reset() {
      return UNSUPPORTED;
    },
    async testPrint() {
      return notInstalled(manufacturer);
    },
    async getRibbonStatus() {
      return { remainingPct: null, message: "Unavailable until the native adapter is installed." };
    },
    async getCardStatus() {
      return { remaining: null, message: "Unavailable until the native adapter is installed." };
    },
    async configure() {
      return notInstalled(manufacturer);
    },
    async calibrate() {
      return notInstalled(manufacturer);
    }
  };
}

export const zebraAdapter = stub("zebra", "Zebra");
export const evolisAdapter = stub("evolis", "Evolis");
export const hidFargoAdapter = stub("hid-fargo", "HID/FARGO");
export const entrustAdapter = stub("entrust", "Entrust");
export const magicardAdapter = stub("magicard", "Magicard");
