import type { PrinterAdapter, PrinterInfo, PrinterStatus, PrintPayload, CalibrationProfile } from "@/lib/card-studio/printers/adapter";
import { DEFAULT_OS_CAPABILITIES, type PrinterAdapter as Adapter } from "@/lib/card-studio/printers/adapter";
import type { PrinterCapabilities, PrintAdapterResult } from "@/lib/card-studio/types";

type SimKind = "success" | "duplex" | "failure";

const SIMULATED: Record<SimKind, { info: PrinterInfo; capabilities: PrinterCapabilities; status: PrinterStatus }> = {
  success: {
    info: {
      id: "sim-cr80",
      name: "RuffOps Virtual CR80 Printer",
      manufacturer: "RuffOps",
      model: "Virtual CR80",
      connection: "simulator",
      adapterId: "simulator",
      nativeIntegration: true,
      serialNumber: "SIM-CR80-001",
      firmware: "sim-1.0"
    },
    capabilities: {
      ...DEFAULT_OS_CAPABILITIES,
      duplex: false,
      automaticDuplex: false,
      manualFlip: true,
      edgeToEdge: true,
      nativeIntegration: true,
      osDriver: false
    },
    status: { code: "online", message: "Simulator online.", ribbonRemainingPct: 82, cardStockRemaining: 140, warnings: [] }
  },
  duplex: {
    info: {
      id: "sim-duplex",
      name: "RuffOps Virtual Duplex Printer",
      manufacturer: "RuffOps",
      model: "Virtual Duplex",
      connection: "simulator",
      adapterId: "simulator",
      nativeIntegration: true,
      serialNumber: "SIM-DUPLEX-001",
      firmware: "sim-1.0"
    },
    capabilities: {
      ...DEFAULT_OS_CAPABILITIES,
      duplex: true,
      automaticDuplex: true,
      manualFlip: true,
      edgeToEdge: true,
      nativeIntegration: true,
      osDriver: false
    },
    status: { code: "online", message: "Simulator online (automatic duplex).", ribbonRemainingPct: 64, cardStockRemaining: 90, warnings: [] }
  },
  failure: {
    info: {
      id: "sim-fail",
      name: "RuffOps Virtual Failure Printer",
      manufacturer: "RuffOps",
      model: "Virtual Failure",
      connection: "simulator",
      adapterId: "simulator",
      nativeIntegration: true,
      serialNumber: "SIM-FAIL-001",
      firmware: "sim-1.0"
    },
    capabilities: {
      ...DEFAULT_OS_CAPABILITIES,
      duplex: false,
      automaticDuplex: false,
      nativeIntegration: true,
      osDriver: false
    },
    status: {
      code: "error",
      message: "Simulator is configured to fail prints.",
      ribbonRemainingPct: 0,
      cardStockRemaining: 0,
      warnings: ["Ribbon empty", "Card stock empty"]
    }
  }
};

export class SimulatorPrinterAdapter implements PrinterAdapter {
  id = "simulator";
  label = "RuffOps Printer Simulator";
  manufacturer = "RuffOps";
  installed = true;

  async discover() {
    return Object.values(SIMULATED).map((item) => item.info);
  }

  async connect() {}
  async disconnect() {}

  async getStatus(printer: PrinterInfo): Promise<PrinterStatus> {
    return lookup(printer.id).status;
  }

  async getCapabilities(printer: PrinterInfo): Promise<PrinterCapabilities> {
    return lookup(printer.id).capabilities;
  }

  async getPrinterInfo(printer: PrinterInfo) {
    return lookup(printer.id).info;
  }

  async print(printer: PrinterInfo, payload: PrintPayload): Promise<PrintAdapterResult> {
    const kind = kindFromId(printer.id);
    if (kind === "failure") {
      return {
        status: "failed",
        message: "Ribbon Empty. The card was NOT marked as printed.",
        raw: { jobId: payload.jobId, simulated: true }
      };
    }
    if (payload.mode === "duplex") {
      const caps = lookup(printer.id).capabilities;
      if (!caps.automaticDuplex) {
        return {
          status: "failed",
          message: "This printer does not support automatic duplex printing. Manual back-side printing is available."
        };
      }
    }
    return { status: "success", message: "Simulated print completed.", raw: { jobId: payload.jobId, simulated: true } };
  }

  async cancel(_printer: PrinterInfo, jobId: string): Promise<PrintAdapterResult> {
    return { status: "success", message: `Cancelled ${jobId} in simulator.` };
  }

  async pause(): Promise<PrintAdapterResult> {
    return { status: "success", message: "Simulator paused." };
  }

  async resume(): Promise<PrintAdapterResult> {
    return { status: "success", message: "Simulator resumed." };
  }

  async reset(): Promise<PrintAdapterResult> {
    return { status: "success", message: "Simulator reset." };
  }

  async testPrint(printer: PrinterInfo): Promise<PrintAdapterResult> {
    return this.print(printer, { jobId: "JOB-TEST", cardId: "test", mode: "front", dpi: 300, copies: 1, color: true });
  }

  async getRibbonStatus(printer: PrinterInfo) {
    const status = lookup(printer.id).status;
    return { remainingPct: status.ribbonRemainingPct ?? null, message: status.message };
  }

  async getCardStatus(printer: PrinterInfo) {
    const status = lookup(printer.id).status;
    return { remaining: status.cardStockRemaining ?? null, message: status.message };
  }

  async configure(): Promise<PrintAdapterResult> {
    return { status: "success", message: "Simulator settings stored." };
  }

  async calibrate(_printer: PrinterInfo, profile: CalibrationProfile): Promise<PrintAdapterResult> {
    return { status: "success", message: "Simulator calibration saved.", raw: { ...profile } };
  }
}

function kindFromId(id: string): SimKind {
  if (id.includes("duplex")) return "duplex";
  if (id.includes("fail")) return "failure";
  return "success";
}

function lookup(id: string) {
  return SIMULATED[kindFromId(id)];
}

export const simulatorAdapter: Adapter = new SimulatorPrinterAdapter();
