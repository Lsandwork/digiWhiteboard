import type { PrinterCapabilities, PrinterConnection, PrinterStatusCode, PrintAdapterResult, PrintMode } from "@/lib/card-studio/types";

export type PrinterInfo = {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  connection: PrinterConnection;
  adapterId: string;
  nativeIntegration: boolean;
  serialNumber?: string | null;
  firmware?: string | null;
  ipAddress?: string | null;
};

export type PrinterStatus = {
  code: PrinterStatusCode;
  message: string;
  ribbonRemainingPct?: number | null;
  cardStockRemaining?: number | null;
  warnings: string[];
};

export type PrintPayload = {
  jobId: string;
  cardId: string;
  mode: PrintMode;
  dpi: number;
  frontPng?: Buffer | null;
  backPng?: Buffer | null;
  copies: number;
  color: boolean;
};

export type CalibrationProfile = {
  xOffsetMm: number;
  yOffsetMm: number;
  scale: number;
  rotation: number;
  frontOffsetXMm: number;
  frontOffsetYMm: number;
  backOffsetXMm: number;
  backOffsetYMm: number;
  bleedMm: number | null;
  printableInsetMm: number | null;
};

export interface PrinterAdapter {
  id: string;
  label: string;
  manufacturer: string;
  installed: boolean;
  discover(): Promise<PrinterInfo[]>;
  connect(printer: PrinterInfo): Promise<void>;
  disconnect(printer: PrinterInfo): Promise<void>;
  getStatus(printer: PrinterInfo): Promise<PrinterStatus>;
  getCapabilities(printer: PrinterInfo): Promise<PrinterCapabilities>;
  getPrinterInfo(printer: PrinterInfo): Promise<PrinterInfo>;
  print(printer: PrinterInfo, payload: PrintPayload, calibration?: CalibrationProfile): Promise<PrintAdapterResult>;
  cancel(printer: PrinterInfo, jobId: string): Promise<PrintAdapterResult>;
  pause(printer: PrinterInfo): Promise<PrintAdapterResult>;
  resume(printer: PrinterInfo): Promise<PrintAdapterResult>;
  reset(printer: PrinterInfo): Promise<PrintAdapterResult>;
  testPrint(printer: PrinterInfo): Promise<PrintAdapterResult>;
  getRibbonStatus(printer: PrinterInfo): Promise<{ remainingPct: number | null; message: string }>;
  getCardStatus(printer: PrinterInfo): Promise<{ remaining: number | null; message: string }>;
  configure(printer: PrinterInfo, settings: Record<string, unknown>): Promise<PrintAdapterResult>;
  calibrate(printer: PrinterInfo, profile: CalibrationProfile): Promise<PrintAdapterResult>;
}

export const UNSUPPORTED: PrintAdapterResult = {
  status: "failed",
  message: "This printer adapter does not support that operation."
};

export function notInstalled(manufacturer: string): PrintAdapterResult {
  return {
    status: "failed",
    message: `${manufacturer} native adapter is not installed. Use OS Driver Mode or install the manufacturer Print Bridge adapter.`
  };
}

export const DEFAULT_OS_CAPABILITIES: PrinterCapabilities = {
  color: true,
  monochrome: true,
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
