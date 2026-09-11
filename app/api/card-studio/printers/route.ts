import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { getPrinter, listPrinters, refreshDiscoveredPrinters, savePrinterCalibration } from "@/lib/card-studio/store";
import { adapterForPrinter, listPrinterAdapters, integrationModeLabel } from "@/lib/card-studio/printers/registry";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  try {
    if (id) {
      const printer = await getPrinter(id);
      if (!printer) return NextResponse.json({ error: "Printer not found." }, { status: 404 });
      const adapter = adapterForPrinter(printer);
      const info = {
        id: printer.id,
        name: printer.name,
        manufacturer: printer.manufacturer,
        model: printer.model,
        connection: printer.connection,
        adapterId: printer.adapter_id,
        nativeIntegration: printer.native_integration
      };
      const [status, capabilities] = await Promise.all([adapter.getStatus(info), adapter.getCapabilities(info)]);
      return NextResponse.json({
        ok: true,
        printer: {
          ...printer,
          status,
          capabilities,
          mode: integrationModeLabel(printer),
          adapterInstalled: adapter.installed
        }
      });
    }
    const printers = await listPrinters();
    return NextResponse.json({
      ok: true,
      printers: printers.map((printer) => ({ ...printer, mode: integrationModeLabel(printer) })),
      adapters: listPrinterAdapters()
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load printers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.manage_printers");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as { action?: string; printerId?: string; profile?: Record<string, number | null> };
  try {
    if (body.action === "discover") {
      const printers = await refreshDiscoveredPrinters();
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: "printer.discovered",
        resourceType: "printer"
      });
      return NextResponse.json({ ok: true, printers });
    }
    if (body.action === "calibrate" && body.printerId && body.profile) {
      const printer = await savePrinterCalibration(body.printerId, {
        xOffsetMm: Number(body.profile.xOffsetMm ?? 0),
        yOffsetMm: Number(body.profile.yOffsetMm ?? 0),
        scale: Number(body.profile.scale ?? 1),
        rotation: Number(body.profile.rotation ?? 0),
        frontOffsetXMm: Number(body.profile.frontOffsetXMm ?? 0),
        frontOffsetYMm: Number(body.profile.frontOffsetYMm ?? 0),
        backOffsetXMm: Number(body.profile.backOffsetXMm ?? 0),
        backOffsetYMm: Number(body.profile.backOffsetYMm ?? 0),
        bleedMm: body.profile.bleedMm ?? null,
        printableInsetMm: body.profile.printableInsetMm ?? null
      });
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: "printer.calibrated",
        resourceType: "printer",
        resourceId: body.printerId
      });
      return NextResponse.json({ ok: true, printer });
    }
    if (body.action === "test" && body.printerId) {
      const printer = await getPrinter(body.printerId);
      if (!printer) return NextResponse.json({ error: "Printer not found." }, { status: 404 });
      const adapter = adapterForPrinter(printer);
      const result = await adapter.testPrint({
        id: printer.id,
        name: printer.name,
        manufacturer: printer.manufacturer,
        model: printer.model,
        connection: printer.connection,
        adapterId: printer.adapter_id,
        nativeIntegration: printer.native_integration
      });
      return NextResponse.json({ ok: result.status === "success", result });
    }
    return NextResponse.json({ error: "Unknown printer action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Printer action failed." }, { status: 500 });
  }
}
