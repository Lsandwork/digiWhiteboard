import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessCardStudio,
  canDeleteCardStudioTemplates,
  canManageCardStudioPrinters,
  canManageCardStudioSettings,
  hasPermission
} from "../lib/admin/permissions";
import { roleCanSeeCardStudioNav, CARD_STUDIO_NAV_ROUTE, buildStaffPanelNav } from "../lib/admin/nav-groups";
import { CR80_PX, cr80AspectRatio, DEFAULT_DPI, CR80_MM, CR80_INCHES } from "../lib/card-studio/constants";
import { createElement, emptyTemplateDocument, parseTemplateDocument } from "../lib/card-studio/template-schema";
import { createFitdogVipTemplateDocument } from "../lib/card-studio/vip-template";
import { resolveTemplateString, unresolvedDynamicFields } from "../lib/card-studio/dynamic-fields";
import { emptyMemberContext } from "../lib/card-studio/dynamic-fields";
import { validateCardForPrint, validateTemplateDocument } from "../lib/card-studio/validation";
import { formatCardNumber, formatJobId } from "../lib/card-studio/job-ids";
import { publicCardStatusLabel, signVerificationToken, verifySignedToken, createVerificationSecret } from "../lib/card-studio/verify";
import { classifyPrintOutcome, retryWouldDuplicate } from "../lib/card-studio/printers/duplicate-protection";
import { SimulatorPrinterAdapter } from "../lib/card-studio/printers/simulator";
import { genericOsAdapter } from "../lib/card-studio/printers/generic-os";
import { zebraAdapter } from "../lib/card-studio/printers/manufacturers";
import { listPrinterAdapters } from "../lib/card-studio/printers/registry";
import { qrPayload } from "../lib/card-studio/codes/qr";
import { suggestedSymbologies, barcodeReadableWarning } from "../lib/card-studio/codes/barcode";
import { photoQualityWarning, wouldUpscale } from "../lib/card-studio/photo/quality";
import { FITDOG_BRAND } from "../lib/fitdog-dashboard/assets";
import { createPrintBridgeToken, verifyPrintBridgeToken } from "../lib/card-studio/printers/bridge-protocol";
import { ADMIN_TABS } from "../lib/admin/types";

const admin = accessFromLegacyRole("admin-id", "admin@fitdog.test", "manager_admin");
const marketing = accessFromLegacyRole("mkt-id", "marketing@fitdog.test", "marketing");
const handler = accessFromLegacyRole("h-id", "handler@fitdog.test", "daycare");
const trainer = accessFromLegacyRole("t-id", "trainer@fitdog.test", "trainer");
const superAdmin = accessFromLegacyRole("sa-id", "lonnie@fitdog.test", "owner_admin");

assert.equal(canAccessCardStudio(admin, "manager_admin"), true);
assert.equal(canAccessCardStudio(marketing, "marketing"), true);
assert.equal(canAccessCardStudio(superAdmin, "owner_admin"), true);
assert.equal(canAccessCardStudio(handler, "daycare"), false);
assert.equal(canAccessCardStudio(trainer, "trainer"), false);
assert.equal(canAccessCardStudio(accessFromLegacyRole("x", "m@fitdog.test", "assistant_manager"), "assistant_manager"), false);

assert.equal(hasPermission(marketing, "card_studio.design"), true);
assert.equal(hasPermission(marketing, "card_studio.print"), true);
assert.equal(hasPermission(marketing, "card_studio.manage_printers"), false);
assert.equal(canManageCardStudioPrinters(marketing, "marketing"), false);
assert.equal(canManageCardStudioSettings(marketing, "marketing"), false);
assert.equal(canDeleteCardStudioTemplates(marketing, "marketing"), false);
assert.equal(canManageCardStudioPrinters(admin, "manager_admin"), true);
assert.equal(canDeleteCardStudioTemplates(admin, "manager_admin"), true);

assert.equal(roleCanSeeCardStudioNav("manager_admin"), true);
assert.equal(roleCanSeeCardStudioNav("marketing"), true);
assert.equal(roleCanSeeCardStudioNav("daycare"), false);
assert.equal(CARD_STUDIO_NAV_ROUTE.href, "/card-studio");

const handlerNav = buildStaffPanelNav([...ADMIN_TABS], "staff", "daycare");
assert.equal(
  handlerNav.some((entry) => entry.type === "route" && entry.id === "card-studio"),
  false,
  "Dog Handlers must not see Card Studio in nav"
);

const adminNav = buildStaffPanelNav([...ADMIN_TABS], "staff", "manager_admin");
const marketingNav = buildStaffPanelNav([...ADMIN_TABS], "marketing", "marketing");
assert.equal(
  marketingNav.some((entry) => entry.type === "route" && entry.id === "card-studio"),
  true
);

assert.equal(CR80_PX.width, 1011);
assert.equal(CR80_PX.height, 638);
assert.ok(Math.abs(cr80AspectRatio() - CR80_MM.width / CR80_MM.height) < 0.0001);
assert.equal(DEFAULT_DPI, 300);
assert.equal(CR80_INCHES.width, 3.375);

const doc = emptyTemplateDocument();
assert.equal(doc.front.width, CR80_PX.width);
assert.equal(doc.schemaVersion, 1);
const parsed = parseTemplateDocument({ schemaVersion: 1, front: { width: 1011, height: 638, dpi: 300, elements: [] } });
assert.equal(parsed.front.height, 638);

const vip = createFitdogVipTemplateDocument();
assert.ok(vip.front.elements.some((el) => el.type === "logo" && String(el.properties.src) === FITDOG_BRAND.logoBadge256));
assert.ok(vip.front.elements.some((el) => el.type === "member_photo"));
assert.ok(vip.back.elements.some((el) => el.type === "barcode"));
assert.equal(validateTemplateDocument(vip).filter((i) => i.severity === "critical").length, 0);

const member = {
  ...emptyMemberContext(),
  name: "Alex Rivera",
  firstName: "Alex",
  lastName: "Rivera",
  dogName: "Maple",
  memberNumber: "FIT-00018429",
  membershipType: "VIP Member",
  cardUuid: "abc",
  expirationDate: "2027-01-01"
};
assert.equal(resolveTemplateString("Hello {{member.name}}", member), "Hello Alex Rivera");
assert.deepEqual(unresolvedDynamicFields("{{member.missing}}", member), ["member.missing"]);

const issues = validateCardForPrint({
  member,
  template: vip,
  sides: "duplex",
  printerOnline: false,
  capabilities: {
    color: true,
    monochrome: true,
    duplex: false,
    automaticDuplex: false,
    manualFlip: true,
    edgeToEdge: true,
    resolution: 300,
    uv: false,
    lamination: false,
    magneticStripe: false,
    smartCard: false,
    contactless: false,
    usb: false,
    ethernet: false,
    wifi: false,
    osDriver: false,
    nativeIntegration: true
  }
});
assert.ok(issues.some((i) => i.code === "PRINTER_OFFLINE"));

assert.equal(formatCardNumber(18429), "FIT-00018429");
assert.equal(formatJobId(new Date("2026-09-10T00:00:00Z"), 184), "JOB-20260910-000184");

const secret = createVerificationSecret();
const token = signVerificationToken("card-1", secret);
assert.equal(verifySignedToken(token, secret)?.cardUuid, "card-1");
assert.equal(publicCardStatusLabel("revoked"), "REVOKED");
assert.equal(publicCardStatusLabel("active", "2099-01-01"), "VALID");
assert.equal(publicCardStatusLabel("active", "2000-01-01"), "EXPIRED");

async function main() {
const sim = new SimulatorPrinterAdapter();
const found = await sim.discover();
assert.equal(found.length, 3);
const duplexCaps = await sim.getCapabilities(found.find((p) => p.id === "sim-duplex")!);
assert.equal(duplexCaps.automaticDuplex, true);
const cr80Caps = await sim.getCapabilities(found.find((p) => p.id === "sim-cr80")!);
assert.equal(cr80Caps.automaticDuplex, false);
const ok = await sim.print(found.find((p) => p.id === "sim-cr80")!, { jobId: "JOB-1", cardId: "c", mode: "front", dpi: 300, copies: 1, color: true });
assert.equal(ok.status, "success");
const fail = await sim.print(found.find((p) => p.id === "sim-fail")!, { jobId: "JOB-2", cardId: "c", mode: "front", dpi: 300, copies: 1, color: true });
assert.equal(fail.status, "failed");
const unknownDuplex = await sim.print(found.find((p) => p.id === "sim-cr80")!, { jobId: "JOB-3", cardId: "c", mode: "duplex", dpi: 300, copies: 1, color: true });
assert.equal(unknownDuplex.status, "failed");

assert.equal(classifyPrintOutcome({ status: "success", message: "ok" }).cardIssued, true);
assert.equal(classifyPrintOutcome({ status: "failed", message: "Ribbon Empty" }).cardIssued, false);
assert.equal(classifyPrintOutcome({ status: "unknown", message: "timeout" }).jobState, "unknown");
assert.equal(retryWouldDuplicate("unknown"), true);
assert.equal(retryWouldDuplicate("failed"), false);

const osPrint = await genericOsAdapter.print(
  { id: "os", name: "Office Printer", manufacturer: "Generic", model: "OS", connection: "os", adapterId: "generic-os", nativeIntegration: false },
  { jobId: "JOB-4", cardId: "c", mode: "front", dpi: 300, copies: 1, color: true }
);
assert.equal(osPrint.status, "unknown");
assert.equal(zebraAdapter.installed, false);
const zebraPrint = await zebraAdapter.print(
  { id: "z", name: "Zebra", manufacturer: "Zebra", model: "ZC300", connection: "usb", adapterId: "zebra", nativeIntegration: false },
  { jobId: "JOB-5", cardId: "c", mode: "front", dpi: 300, copies: 1, color: true }
);
assert.equal(zebraPrint.status, "failed");
assert.ok(listPrinterAdapters().some((a) => a.id === "simulator"));

const qr = qrPayload({
  contentType: "verification_url",
  value: "{{member.card_uuid}}",
  member,
  verificationBaseUrl: "https://staff.ruffops.com"
});
assert.ok(qr.includes("/card-studio/verify/abc"));
assert.deepEqual(suggestedSymbologies("1234567890128").includes("ean13"), true);
assert.ok(barcodeReadableWarning("code128", 80, 20, 2));

assert.ok(photoQualityWarning(80, 168, 300));
assert.equal(wouldUpscale(80, 168), true);

const el = createElement("text", { x: 10, y: 10 });
assert.ok(el.id.startsWith("element_"));

const bridgeSecret = "bridge-secret-test";
const bridgeToken = createPrintBridgeToken("bridge-1", bridgeSecret, 60_000);
assert.equal(verifyPrintBridgeToken(bridgeToken, bridgeSecret)?.bridgeId, "bridge-1");
assert.equal(verifyPrintBridgeToken("nope", bridgeSecret), null);

console.log("card-studio tests passed");
}

void main();
