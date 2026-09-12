import { randomUUID } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { parseTemplateDocument } from "@/lib/card-studio/template-schema";
import {
  builtinClubSportsVipTemplate,
  CLUB_SPORTS_VIP_TEMPLATE_NAME,
  documentUsesExactClubSportsArtwork,
  isClubSportsVipBuiltinId,
  isClubSportsVipTemplate,
  productionClubSportsVipDocument
} from "@/lib/card-studio/club-sports-vip-template";
import { DEFAULT_CARD_STUDIO_SETTINGS } from "@/lib/card-studio/settings";
import { gingrBarcodeValue } from "@/lib/card-studio/gingr-barcode";
import { DEFAULT_PRODUCTION_BARCODE_SOURCE, DEFAULT_PRODUCTION_BARCODE_SYMBOLOGY } from "@/lib/card-studio/gingr-identity";
import { formatCardNumber, formatJobId } from "@/lib/card-studio/job-ids";
import { signVerificationToken } from "@/lib/card-studio/verify";
import { classifyPrintOutcome, retryWouldDuplicate } from "@/lib/card-studio/printers/duplicate-protection";
import { adapterForPrinter, discoverAllPrinters } from "@/lib/card-studio/printers/registry";
import { OFFICE_PRINTER, OFFICE_PRINTER_ID } from "@/lib/card-studio/printers/generic-os";
import { validateCardForPrint } from "@/lib/card-studio/validation";
import { renderPopulatedArtwork } from "@/lib/card-studio/render/artwork";
import { osPrintUsesDialog } from "@/lib/card-studio/render/os-print-sheet";
import type { CardStudioSettings, MemberCardContext, PrintMode, ReprintReason, TemplateCategory, TemplateState } from "@/lib/card-studio/types";
import type { CardTemplateDocument } from "@/lib/card-studio/types";

type Actor = { adminUserId?: string | null; email?: string | null; role?: string | null };

function db() {
  return getServiceSupabase();
}

export async function loadCardStudioSettings(): Promise<CardStudioSettings> {
  const supabase = db();
  const { data } = await supabase.from("card_studio_settings").select("settings").eq("id", "default").maybeSingle();
  return { ...DEFAULT_CARD_STUDIO_SETTINGS, ...((data?.settings as Partial<CardStudioSettings>) ?? {}) };
}

export async function saveCardStudioSettings(settings: Partial<CardStudioSettings>, actor: Actor) {
  const current = await loadCardStudioSettings();
  const next = { ...current, ...settings };
  const supabase = db();
  await supabase.from("card_studio_settings").upsert({
    id: "default",
    settings: next,
    updated_at: new Date().toISOString(),
    updated_by: actor.adminUserId ?? null
  });
  return next;
}

export async function ensureDefaultTemplates(actor: Actor) {
  try {
    const supabase = db();
    const { data: existing, error } = await supabase.from("card_studio_templates").select("id, name");
    if (error) return;
    const names = new Set((existing ?? []).map((row) => String(row.name)));
    const exactDoc = productionClubSportsVipDocument();
    const description =
      "Production Club + Sports VIP template. Locked artwork plus dynamic slots for member photo, dog name, member ID, and the Gingr owner UPC-A barcode.";
    if (!names.has(CLUB_SPORTS_VIP_TEMPLATE_NAME)) {
      await createTemplate(
        {
          name: CLUB_SPORTS_VIP_TEMPLATE_NAME,
          description,
          category: "club_sports_vip",
          status: "active",
          document: exactDoc
        },
        actor
      );
      return;
    }
    const row = (existing ?? []).find((item) => String(item.name) === CLUB_SPORTS_VIP_TEMPLATE_NAME);
    if (!row?.id) return;
    const supabaseRow = await supabase.from("card_studio_templates").select("current_version_id").eq("id", row.id).maybeSingle();
    const { data: version } = supabaseRow.data?.current_version_id
      ? await supabase
          .from("card_studio_template_versions")
          .select("document")
          .eq("id", supabaseRow.data.current_version_id)
          .maybeSingle()
      : { data: null };
    const stored = parseTemplateDocument(version?.document);
    const barcode = [...stored.front.elements, ...stored.back.elements].find((el) => el.type === "barcode");
    const needsProductionDoc =
      !documentUsesExactClubSportsArtwork(stored) ||
      String(barcode?.properties.symbology) !== "upca" ||
      String(barcode?.properties.source) !== "gingr_owner_barcode";
    if (needsProductionDoc) {
      await saveTemplateVersion(String(row.id), exactDoc, actor, {
        description,
        status: "active",
        bumpVersion: true
      });
    }
  } catch {
    // Card Studio still shows the built-in Club + Sports VIP artwork if the table is missing.
  }
}

export async function listTemplates(options?: { status?: TemplateState | "all"; limit?: number }) {
  const builtin = builtinClubSportsVipTemplate();
  try {
    const supabase = db();
    let query = supabase
      .from("card_studio_templates")
      .select("id, name, description, category, status, current_version_id, created_by, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(Math.min(100, options?.limit ?? 50));
    if (options?.status && options.status !== "all") query = query.eq("status", options.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.some((row) => row.name === CLUB_SPORTS_VIP_TEMPLATE_NAME)) return rows;
    if (options?.status && options.status !== "all" && options.status !== "active") return rows;
    return [builtin, ...rows];
  } catch {
    return [builtin];
  }
}

export async function getTemplate(id: string) {
  if (isClubSportsVipBuiltinId(id)) return builtinClubSportsVipTemplate();
  const supabase = db();
  const { data: template, error } = await supabase.from("card_studio_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) return null;
  const { data: version } = await supabase
    .from("card_studio_template_versions")
    .select("id, version, document, created_at, created_by")
    .eq("id", template.current_version_id)
    .maybeSingle();
  const parsed = parseTemplateDocument(version?.document);
  return {
    ...template,
    version: version?.version ?? 1,
    versionId: version?.id ?? null,
    document: isClubSportsVipTemplate({ id: String(template.id), name: String(template.name), document: parsed })
      ? productionClubSportsVipDocument()
      : parsed
  };
}

export async function createTemplate(
  input: {
    name: string;
    description?: string;
    category: TemplateCategory | string;
    status?: TemplateState;
    document: CardTemplateDocument;
  },
  actor: Actor
) {
  const supabase = db();
  const { data: template, error } = await supabase
    .from("card_studio_templates")
    .insert({
      name: input.name,
      description: input.description ?? "",
      category: input.category,
      status: input.status ?? "draft",
      created_by: actor.adminUserId ?? null,
      updated_by: actor.adminUserId ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { data: version, error: versionError } = await supabase
    .from("card_studio_template_versions")
    .insert({
      template_id: template.id,
      version: 1,
      document: input.document,
      created_by: actor.adminUserId ?? null
    })
    .select("id, version")
    .single();
  if (versionError) throw new Error(versionError.message);
  await supabase.from("card_studio_templates").update({ current_version_id: version.id }).eq("id", template.id);
  return { ...template, version: version.version, versionId: version.id, document: input.document };
}

export async function saveTemplateVersion(
  templateId: string,
  document: CardTemplateDocument,
  actor: Actor,
  options?: { name?: string; description?: string; status?: TemplateState; bumpVersion?: boolean }
) {
  const supabase = db();
  const current = await getTemplate(templateId);
  if (!current) throw new Error("Template not found.");
  const bump = options?.bumpVersion !== false;
  if (!bump && current.versionId) {
    await supabase.from("card_studio_template_versions").update({ document }).eq("id", current.versionId);
    await supabase
      .from("card_studio_templates")
      .update({
        name: options?.name ?? current.name,
        description: options?.description ?? current.description,
        status: options?.status ?? current.status,
        updated_by: actor.adminUserId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", templateId);
    return getTemplate(templateId);
  }
  const nextVersion = (current.version ?? 1) + 1;
  const { data: version, error } = await supabase
    .from("card_studio_template_versions")
    .insert({
      template_id: templateId,
      version: nextVersion,
      document,
      created_by: actor.adminUserId ?? null
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase
    .from("card_studio_templates")
    .update({
      current_version_id: version.id,
      name: options?.name ?? current.name,
      description: options?.description ?? current.description,
      status: options?.status ?? current.status,
      updated_by: actor.adminUserId ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", templateId);
  return getTemplate(templateId);
}

export async function duplicateTemplate(templateId: string, actor: Actor) {
  const current = await getTemplate(templateId);
  if (!current) throw new Error("Template not found.");
  return createTemplate(
    {
      name: `${current.name} copy`,
      description: current.description,
      category: current.category,
      status: "draft",
      document: current.document
    },
    actor
  );
}

export async function archiveTemplate(templateId: string, actor: Actor) {
  const supabase = db();
  const { error } = await supabase
    .from("card_studio_templates")
    .update({ status: "archived", updated_by: actor.adminUserId ?? null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw new Error(error.message);
}

export async function listPrinters() {
  const office = officePrinterRow();
  try {
    const supabase = db();
    const { data, error } = await supabase.from("card_studio_printers").select("*").order("name");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (!rows.some((row) => pId(row) === OFFICE_PRINTER_ID)) return [office, ...rows];
    return rows;
  } catch {
    return [office];
  }
}

function pId(row: { id?: string }) {
  return String(row.id ?? "");
}

function officePrinterRow() {
  return {
    id: OFFICE_PRINTER.id,
    name: OFFICE_PRINTER.name,
    manufacturer: OFFICE_PRINTER.manufacturer,
    model: OFFICE_PRINTER.model,
    adapter_id: OFFICE_PRINTER.adapterId,
    connection: OFFICE_PRINTER.connection,
    native_integration: false,
    ip_address: null,
    serial_number: null,
    firmware: null,
    capabilities: {
      color: true,
      monochrome: true,
      duplex: true,
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
    },
    status_code: "online",
    status_message: "Ready for this computer’s print dialog (normal office printer).",
    last_seen_at: new Date().toISOString()
  };
}

export async function refreshDiscoveredPrinters() {
  const discovered = await discoverAllPrinters();
  const supabase = db();
  for (const printer of discovered) {
    const adapter = adapterForPrinter({ adapter_id: printer.adapterId });
    const capabilities = await adapter.getCapabilities(printer);
    const status = await adapter.getStatus(printer);
    await supabase.from("card_studio_printers").upsert({
      id: printer.id,
      name: printer.name,
      manufacturer: printer.manufacturer,
      model: printer.model,
      adapter_id: printer.adapterId,
      connection: printer.connection,
      native_integration: printer.nativeIntegration,
      ip_address: printer.ipAddress ?? null,
      serial_number: printer.serialNumber ?? null,
      firmware: printer.firmware ?? null,
      capabilities,
      status_code: status.code,
      status_message: status.message,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return listPrinters();
}

export async function getPrinter(id: string) {
  if (id === OFFICE_PRINTER_ID) {
    try {
      const supabase = db();
      const { data } = await supabase.from("card_studio_printers").select("*").eq("id", id).maybeSingle();
      if (data) {
        const { data: profiles } = await supabase.from("card_studio_printer_profiles").select("*").eq("printer_id", id);
        return { ...data, profiles: profiles ?? [] };
      }
    } catch {
      // Fall through to the built-in office printer so printing still works before migration.
    }
    return { ...officePrinterRow(), profiles: [] };
  }
  const supabase = db();
  const { data } = await supabase.from("card_studio_printers").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: profiles } = await supabase.from("card_studio_printer_profiles").select("*").eq("printer_id", id);
  return { ...data, profiles: profiles ?? [] };
}

export async function savePrinterCalibration(
  printerId: string,
  profile: {
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
  }
) {
  const supabase = db();
  const { data: existing } = await supabase
    .from("card_studio_printer_profiles")
    .select("id")
    .eq("printer_id", printerId)
    .eq("is_default", true)
    .maybeSingle();
  const row = {
    printer_id: printerId,
    name: "Default CR80",
    dpi: 300,
    x_offset_mm: profile.xOffsetMm,
    y_offset_mm: profile.yOffsetMm,
    scale: profile.scale,
    rotation: profile.rotation,
    front_offset_x_mm: profile.frontOffsetXMm,
    front_offset_y_mm: profile.frontOffsetYMm,
    back_offset_x_mm: profile.backOffsetXMm,
    back_offset_y_mm: profile.backOffsetYMm,
    bleed_mm: profile.bleedMm,
    printable_inset_mm: profile.printableInsetMm,
    is_default: true,
    updated_at: new Date().toISOString()
  };
  if (existing?.id) {
    await supabase.from("card_studio_printer_profiles").update(row).eq("id", existing.id);
  } else {
    await supabase.from("card_studio_printer_profiles").insert(row);
  }
  const adapter = adapterForPrinter({ adapter_id: (await getPrinter(printerId))?.adapter_id });
  const info = {
    id: printerId,
    name: printerId,
    manufacturer: "RuffOps",
    model: "profile",
    connection: "simulator" as const,
    adapterId: adapter.id,
    nativeIntegration: true
  };
  await adapter.calibrate(infoFromPrinter(await getPrinter(printerId)), profile);
  return getPrinter(printerId);
}

function infoFromPrinter(printer: Awaited<ReturnType<typeof getPrinter>>) {
  return {
    id: printer!.id,
    name: printer!.name,
    manufacturer: printer!.manufacturer,
    model: printer!.model,
    connection: printer!.connection,
    adapterId: printer!.adapter_id,
    nativeIntegration: printer!.native_integration,
    serialNumber: printer!.serial_number,
    firmware: printer!.firmware,
    ipAddress: printer!.ip_address
  };
}

export async function dashboardStats() {
  const supabase = db();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, week, month, queued, failed, reprints, printers, recentCards, recentTemplates] = await Promise.all([
    supabase.from("card_studio_cards").select("id", { count: "exact", head: true }).gte("issued_at", startOfDay.toISOString()),
    supabase.from("card_studio_cards").select("id", { count: "exact", head: true }).gte("issued_at", startOfWeek.toISOString()),
    supabase.from("card_studio_cards").select("id", { count: "exact", head: true }).gte("issued_at", startOfMonth.toISOString()),
    supabase.from("card_studio_print_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "preparing", "rendering", "sending", "printing", "retrying", "paused"]),
    supabase.from("card_studio_print_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("card_studio_reprint_requests").select("id", { count: "exact", head: true }),
    supabase.from("card_studio_printers").select("id, name, status_code, status_message, native_integration, adapter_id"),
    supabase
      .from("card_studio_cards")
      .select("id, card_number, member_name, dog_name, status, issued_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("card_studio_templates").select("id, name, category, status, updated_at").order("updated_at", { ascending: false }).limit(6)
  ]);

  const printerRows = printers.data ?? [];
  return {
    issuedToday: today.count ?? 0,
    issuedWeek: week.count ?? 0,
    issuedMonth: month.count ?? 0,
    awaitingPrint: queued.count ?? 0,
    failedJobs: failed.count ?? 0,
    reprintRequests: reprints.count ?? 0,
    activePrinters: printerRows.filter((p) => p.status_code === "online").length,
    printerWarnings: printerRows.filter((p) => p.status_code !== "online").map((p) => ({ id: p.id, name: p.name, message: p.status_message, code: p.status_code })),
    recentCards: recentCards.data ?? [],
    recentTemplates: recentTemplates.data ?? [],
    printers: printerRows
  };
}

export async function listIssuedCards(options?: { query?: string; status?: string; limit?: number; offset?: number }) {
  const supabase = db();
  const limit = Math.min(50, Math.max(1, options?.limit ?? 25));
  const offset = Math.max(0, options?.offset ?? 0);
  let query = supabase
    .from("card_studio_cards")
    .select("id, card_uuid, card_number, status, member_name, dog_name, membership_type, template_id, template_version, issued_at, expiration_at, reprint_count, printer_id")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (options?.status) query = query.eq("status", options.status);
  if (options?.query) {
    const q = options.query.replace(/,/g, "");
    query = query.or(`member_name.ilike.%${q}%,dog_name.ilike.%${q}%,card_number.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listPrintJobs(options?: { status?: string; limit?: number }) {
  const supabase = db();
  let query = supabase
    .from("card_studio_print_jobs")
    .select("id, job_id, card_id, printer_id, status, error_message, retry_count, duplicate_risk, print_mode, created_at, started_at, completed_at, operator_email")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, options?.limit ?? 40));
  if (options?.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAuditEvents(limit = 50) {
  const supabase = db();
  const { data, error } = await supabase
    .from("card_studio_audit_events")
    .select("id, actor_email, actor_role, action, resource_type, resource_id, result, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(100, limit));
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function nextSequences() {
  const supabase = db();
  const card = await supabase.rpc("card_studio_next_card_number").maybeSingle();
  if (!card.error && card.data != null) {
    const job = await supabase.rpc("card_studio_next_job_number").maybeSingle();
    return { cardSeq: Number(card.data), jobSeq: Number(job.data ?? 1) };
  }
  const cardSeq = Math.floor(Date.now() / 1000) % 100000000;
  const jobSeq = Math.floor(Date.now() % 1000000);
  return { cardSeq, jobSeq };
}

async function ensureOfficePrinterRecord() {
  const row = officePrinterRow();
  const supabase = db();
  await supabase.from("card_studio_printers").upsert({
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    model: row.model,
    adapter_id: row.adapter_id,
    connection: row.connection,
    native_integration: row.native_integration,
    capabilities: row.capabilities,
    status_code: row.status_code,
    status_message: row.status_message,
    last_seen_at: row.last_seen_at,
    updated_at: new Date().toISOString()
  });
}

export async function submitPrintJob(input: {
  member: MemberCardContext;
  templateId: string;
  printerId: string;
  mode: PrintMode;
  overrideWarnings?: boolean;
  expirationAt?: string | null;
  batchId?: string | null;
  idempotencyKey?: string;
}, actor: Actor) {
  if (input.printerId === OFFICE_PRINTER_ID) {
    try {
      await ensureOfficePrinterRecord();
    } catch {
      try {
        await refreshDiscoveredPrinters();
      } catch {
        // Office printer still works via getPrinter fallback if the table is missing.
      }
    }
  }
  const settings = await loadCardStudioSettings();
  let template = await getTemplate(input.templateId);
  if (!template) throw new Error("Template not found.");
  if (isClubSportsVipBuiltinId(template.id)) {
    template = await createTemplate(
      {
        name: template.name,
        description: template.description,
        category: template.category,
        status: "active",
        document: template.document
      },
      actor
    );
  }
  const printer = await getPrinter(input.printerId);
  if (!printer) throw new Error("Printer not found.");
  const adapter = adapterForPrinter(printer);
  const info = infoFromPrinter(printer);
  const status = await adapter.getStatus(info);
  const capabilities = await adapter.getCapabilities(info);
  const member: MemberCardContext = {
    ...input.member,
    issueDate: input.member.issueDate ?? new Date().toISOString().slice(0, 10),
    expirationDate: input.member.expirationDate ?? input.expirationAt ?? null,
    membershipType: input.member.membershipType ?? "VIP Member",
    location: input.member.location ?? "Fitdog"
  };
  const issues = validateCardForPrint({
    member,
    template: template.document,
    sides: input.mode,
    printerOnline: status.code === "online",
    capabilities
  });
  const hard = issues.filter((item) => item.severity === "critical");
  if (hard.length) return { ok: false as const, issues };
  if (!input.overrideWarnings && issues.some((i) => i.severity === "warning")) {
    return { ok: false as const, issues, requiresOverride: true };
  }

  const seq = await nextSequences();
  const cardUuid = randomUUID();
  member.cardUuid = cardUuid;
  const gingrOwnerBarcode = gingrBarcodeValue(member);
  if (gingrOwnerBarcode) {
    member.barcodeSource = DEFAULT_PRODUCTION_BARCODE_SOURCE;
    member.barcodeValue = gingrOwnerBarcode;
    member.gingrOwnerBarcode = member.gingrOwnerBarcode || gingrOwnerBarcode;
  }
  member.memberNumber = member.gingrAnimalId || member.memberNumber;
  const cardNumber = formatCardNumber(seq.cardSeq);
  const jobId = formatJobId(new Date(), seq.jobSeq);
  const supabase = db();

  if (input.idempotencyKey) {
    const { data: existing } = await supabase.from("card_studio_print_jobs").select("*").eq("idempotency_key", input.idempotencyKey).maybeSingle();
    if (existing) return { ok: true as const, job: existing, issues: [], idempotent: true };
  }

  const cardPayload = {
    card_uuid: cardUuid,
    card_number: cardNumber,
    status: "queued",
    member_name: member.name,
    dog_name: member.dogName,
    membership_type: member.membershipType,
    fitdog_owner_id: member.fitdogOwnerId,
    fitdog_dog_id: member.fitdogDogId,
    gingr_animal_id: member.gingrAnimalId,
    gingr_owner_id: member.gingrOwnerId,
    barcode_source: member.barcodeSource,
    barcode_value: member.barcodeValue,
    barcode_symbology: DEFAULT_PRODUCTION_BARCODE_SYMBOLOGY,
    ops_dog_id: member.opsDogId,
    member_snapshot: member,
    template_id: template.id,
    template_version_id: template.versionId,
    template_version: template.version,
    printer_id: printer.id,
    operator_admin_id: actor.adminUserId ?? null,
    expiration_at: member.expirationDate
  };
  let { data: card, error: cardError } = await supabase.from("card_studio_cards").insert(cardPayload).select("*").single();
  if (cardError && /gingr_owner_id|barcode_source|barcode_value|barcode_symbology/.test(cardError.message)) {
    const fallback = { ...cardPayload } as Record<string, unknown>;
    delete fallback.gingr_owner_id;
    delete fallback.barcode_source;
    delete fallback.barcode_value;
    delete fallback.barcode_symbology;
    const retry = await supabase.from("card_studio_cards").insert(fallback).select("*").single();
    card = retry.data;
    cardError = retry.error;
  }
  if (cardError) throw new Error(cardError.message);
  if (!card) throw new Error("Card row was not created.");

  const { data: job, error: jobError } = await supabase
    .from("card_studio_print_jobs")
    .insert({
      job_id: jobId,
      card_id: card.id,
      template_id: template.id,
      template_version_id: template.versionId,
      printer_id: printer.id,
      operator_admin_id: actor.adminUserId ?? null,
      operator_email: actor.email ?? null,
      print_mode: input.mode,
      status: "preparing",
      idempotency_key: input.idempotencyKey ?? jobId,
      batch_id: input.batchId ?? null,
      started_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (jobError) throw new Error(jobError.message);

  await supabase.from("card_studio_verification_tokens").insert({
    card_id: card.id,
    token: cardUuid
  });

  await supabase.from("card_studio_print_jobs").update({ status: "sending" }).eq("id", job.id);

  const printResult = await adapter.print(info, {
    jobId,
    cardId: card.id,
    mode: input.mode,
    dpi: 300,
    copies: 1,
    color: true
  });
  const outcome = classifyPrintOutcome(printResult);
  await supabase
    .from("card_studio_print_jobs")
    .update({
      status: outcome.jobState,
      error_message: outcome.cardIssued ? null : outcome.message,
      duplicate_risk: outcome.duplicateRisk === "possible_duplicate",
      completed_at: outcome.jobState === "completed" || outcome.jobState === "failed" || outcome.jobState === "unknown" ? new Date().toISOString() : null
    })
    .eq("id", job.id);

  if (outcome.cardIssued) {
    await supabase
      .from("card_studio_cards")
      .update({
        status: "active",
        issued_at: new Date().toISOString(),
        print_job_id: job.id
      })
      .eq("id", card.id);
  } else {
    await supabase.from("card_studio_cards").update({ status: "draft", print_job_id: job.id }).eq("id", card.id);
  }

  let artwork = null;
  if (osPrintUsesDialog(printer)) {
    try {
      artwork = await renderPopulatedArtwork(template.document, member, settings.verificationBaseUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not encode a Gingr barcode.";
      await supabase
        .from("card_studio_print_jobs")
        .update({
          status: "failed",
          error_message: message,
          completed_at: new Date().toISOString()
        })
        .eq("id", job.id);
      return {
        ok: false as const,
        issues: [
          ...issues,
          { severity: "critical" as const, code: "BARCODE_ENCODE", message, overrideable: false }
        ]
      };
    }
  }

  return {
    ok: true as const,
    issues,
    job: { ...job, job_id: jobId, status: outcome.jobState },
    card: { ...card, card_uuid: cardUuid, status: outcome.cardIssued ? "active" : "draft" },
    print: { ...outcome, raw: printResult },
    artwork,
    osPrint: osPrintUsesDialog(printer),
    verificationUrl: `${settings.verificationBaseUrl.replace(/\/$/, "")}/card-studio/verify/${cardUuid}`
  };
}

export async function confirmOsPrint(jobRowId: string, printed: boolean, actor: Actor) {
  const supabase = db();
  const { data: job } = await supabase.from("card_studio_print_jobs").select("*").eq("id", jobRowId).maybeSingle();
  if (!job) throw new Error("Print job not found.");
  if (printed) {
    await supabase
      .from("card_studio_print_jobs")
      .update({
        status: "completed",
        error_message: null,
        duplicate_risk: false,
        completed_at: new Date().toISOString()
      })
      .eq("id", job.id);
    if (job.card_id) {
      await supabase
        .from("card_studio_cards")
        .update({ status: "active", issued_at: new Date().toISOString(), print_job_id: job.id })
        .eq("id", job.card_id);
    }
    return { ok: true as const, printed: true, actor };
  }
  await supabase
    .from("card_studio_print_jobs")
    .update({
      status: "cancelled",
      error_message: "Operator reported the normal printer did not produce a card.",
      completed_at: new Date().toISOString()
    })
    .eq("id", job.id);
  return { ok: true as const, printed: false, actor };
}

export async function retryPrintJob(jobRowId: string, confirmDuplicate: boolean, actor: Actor) {
  const supabase = db();
  const { data: job } = await supabase.from("card_studio_print_jobs").select("*").eq("id", jobRowId).maybeSingle();
  if (!job) throw new Error("Print job not found.");
  if (retryWouldDuplicate(job.status) && !confirmDuplicate) {
    return {
      ok: false as const,
      duplicateRisk: true,
      message: "The previous print result is unknown. Confirm that a physical card was not already printed before retrying."
    };
  }
  const printer = await getPrinter(job.printer_id);
  if (!printer) throw new Error("Printer not found.");
  const adapter = adapterForPrinter(printer);
  const info = infoFromPrinter(printer);
  await supabase
    .from("card_studio_print_jobs")
    .update({ status: "retrying", retry_count: (job.retry_count ?? 0) + 1, started_at: new Date().toISOString() })
    .eq("id", job.id);
  const printResult = await adapter.print(info, {
    jobId: job.job_id,
    cardId: job.card_id,
    mode: job.print_mode,
    dpi: 300,
    copies: 1,
    color: true
  });
  const outcome = classifyPrintOutcome(printResult);
  await supabase
    .from("card_studio_print_jobs")
    .update({
      status: outcome.jobState,
      error_message: outcome.cardIssued ? null : outcome.message,
      duplicate_risk: outcome.duplicateRisk === "possible_duplicate",
      completed_at: new Date().toISOString()
    })
    .eq("id", job.id);
  if (outcome.cardIssued && job.card_id) {
    await supabase.from("card_studio_cards").update({ status: "active", issued_at: new Date().toISOString() }).eq("id", job.card_id);
  }
  return { ok: true as const, print: outcome, actor };
}

export async function updatePrintJobStatus(jobRowId: string, status: string) {
  const supabase = db();
  await supabase.from("card_studio_print_jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", jobRowId);
}

export async function reprintCard(input: {
  cardId: string;
  reason: ReprintReason;
  notes?: string;
  printerId: string;
  overrideWarnings?: boolean;
}, actor: Actor) {
  if (!input.reason) throw new Error("A reprint reason is required.");
  const supabase = db();
  const { data: original } = await supabase.from("card_studio_cards").select("*").eq("id", input.cardId).maybeSingle();
  if (!original) throw new Error("Card not found.");
  if (!original.template_id) throw new Error("This card has no template version to reprint.");
  const member = (original.member_snapshot ?? {}) as MemberCardContext;
  const result = await submitPrintJob(
    {
      member,
      templateId: original.template_id,
      printerId: input.printerId,
      mode: "duplex",
      overrideWarnings: input.overrideWarnings
    },
    actor
  );
  if (!result.ok || !("card" in result) || !result.card) return result;
  await supabase.from("card_studio_reprint_requests").insert({
    original_card_id: original.id,
    new_card_id: result.card.id,
    reason: input.reason,
    notes: input.notes ?? "",
    requested_by: actor.adminUserId ?? null,
    printer_id: input.printerId,
    result: result.print?.jobState ?? "unknown"
  });
  await supabase
    .from("card_studio_cards")
    .update({ reprint_count: (original.reprint_count ?? 0) + 1, status: "replaced", replaced_card_id: result.card.id })
    .eq("id", original.id);
  return result;
}

export async function revokeCard(cardId: string, actor: Actor) {
  const supabase = db();
  await supabase
    .from("card_studio_cards")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", cardId);
  await supabase.from("card_studio_verification_tokens").update({ revoked_at: new Date().toISOString() }).eq("card_id", cardId);
  return { ok: true, actor };
}

export async function publicVerify(token: string) {
  const supabase = db();
  const { data: card } = await supabase
    .from("card_studio_cards")
    .select("card_uuid, card_number, member_name, membership_type, status, expiration_at, issued_at")
    .or(`card_uuid.eq.${token},card_number.eq.${token}`)
    .maybeSingle();
  if (!card) {
    const { data: byToken } = await supabase.from("card_studio_verification_tokens").select("card_id, revoked_at").eq("token", token).maybeSingle();
    if (!byToken) return null;
    const { data: linked } = await supabase
      .from("card_studio_cards")
      .select("card_uuid, card_number, member_name, membership_type, status, expiration_at, issued_at")
      .eq("id", byToken.card_id)
      .maybeSingle();
    return linked;
  }
  return card;
}

export { signVerificationToken };
