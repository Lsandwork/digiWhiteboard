import type { PrinterAdapter, PrinterInfo } from "@/lib/card-studio/printers/adapter";
import { simulatorAdapter } from "@/lib/card-studio/printers/simulator";
import { genericOsAdapter } from "@/lib/card-studio/printers/generic-os";
import { zebraAdapter, evolisAdapter, hidFargoAdapter, entrustAdapter, magicardAdapter } from "@/lib/card-studio/printers/manufacturers";

const adapters: PrinterAdapter[] = [
  simulatorAdapter,
  genericOsAdapter,
  zebraAdapter,
  evolisAdapter,
  hidFargoAdapter,
  entrustAdapter,
  magicardAdapter
];

export function listPrinterAdapters() {
  return adapters.map((adapter) => ({
    id: adapter.id,
    label: adapter.label,
    manufacturer: adapter.manufacturer,
    installed: adapter.installed
  }));
}

export function getPrinterAdapter(id: string): PrinterAdapter {
  return adapters.find((item) => item.id === id) ?? genericOsAdapter;
}

export async function discoverAllPrinters(): Promise<PrinterInfo[]> {
  const found: PrinterInfo[] = [];
  for (const adapter of adapters) {
    try {
      found.push(...(await adapter.discover()));
    } catch {
      // Discovery failures must not take down Printer Manager.
    }
  }
  return found;
}

export function adapterForPrinter(printer: { adapter_id?: string | null; adapterId?: string | null }) {
  return getPrinterAdapter(printer.adapter_id || printer.adapterId || "generic-os");
}

export function integrationModeLabel(printer: { adapter_id?: string | null; native_integration?: boolean }) {
  const adapter = getPrinterAdapter(printer.adapter_id || "generic-os");
  if (adapter.id === "simulator") return "SIMULATOR";
  if (adapter.installed && adapter.id !== "generic-os") return "NATIVE INTEGRATION";
  return "OS DRIVER MODE";
}
