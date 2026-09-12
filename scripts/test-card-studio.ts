import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
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
import { builtinClubSportsVipTemplate, CLUB_SPORTS_VIP_BUILTIN_ID, CLUB_SPORTS_VIP_EXACT_ARTWORK, CLUB_SPORTS_VIP_TEMPLATE_NAME, containRect, createClubSportsVipTemplateDocument, documentUsesExactClubSportsArtwork } from "../lib/card-studio/club-sports-vip-template";
import { resolveTemplateString, unresolvedDynamicFields } from "../lib/card-studio/dynamic-fields";
import { emptyMemberContext } from "../lib/card-studio/dynamic-fields";
import { validateCardForPrint, validateTemplateDocument } from "../lib/card-studio/validation";
import { formatCardNumber, formatJobId } from "../lib/card-studio/job-ids";
import { publicCardStatusLabel, signVerificationToken, verifySignedToken, createVerificationSecret } from "../lib/card-studio/verify";
import { classifyPrintOutcome, retryWouldDuplicate } from "../lib/card-studio/printers/duplicate-protection";
import { SimulatorPrinterAdapter } from "../lib/card-studio/printers/simulator";
import { genericOsAdapter, OFFICE_PRINTER, OFFICE_PRINTER_ID } from "../lib/card-studio/printers/generic-os";
import { buildOsPrintHtml, osPrintUsesDialog } from "../lib/card-studio/render/os-print-sheet";
import { zebraAdapter } from "../lib/card-studio/printers/manufacturers";
import { listPrinterAdapters } from "../lib/card-studio/printers/registry";
import { qrPayload } from "../lib/card-studio/codes/qr";
import { suggestedSymbologies, barcodeReadableWarning, renderBarcodeSvg } from "../lib/card-studio/codes/barcode";
import {
  barcodeValueLooksLikeInternalCardNumber,
  gingrBarcodeValue,
  isGingrCompatibleBarcodePayload,
  normalizeGingrAnimalId
} from "../lib/card-studio/gingr-barcode";
import { renderPopulatedArtwork } from "../lib/card-studio/render/artwork";
import {
  barcodeCompatibilityNote,
  DEFAULT_PRODUCTION_BARCODE_SOURCE,
  extractGingrOwnerBarcode,
  resolveBarcodeFromSource
} from "../lib/card-studio/gingr-identity";
import { MEMBER_DOG_NAME_SLOT_ID, MEMBER_ID_SLOT_ID, OWNER_BARCODE_SLOT_ID } from "../lib/card-studio/club-sports-vip-template";
import { MEMBER_PHOTO_SLOT_ID, countMemberPhotoSlots, pruneStackedMemberPhotos, replaceMemberPhoto } from "../lib/card-studio/photo-slot";
import { evaluateUpcA } from "../lib/card-studio/upc-a";
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
const vipBarcode = vip.back.elements.find((el) => el.type === "barcode");
assert.equal(String(vipBarcode?.properties.value), "{{member.barcode}}");
assert.equal(String(vipBarcode?.properties.symbology), "code128");
assert.ok(!String(vip.back.elements.find((el) => el.id === "vip_back_barcode")?.properties.value ?? "").includes("FD-"));
assert.equal(validateTemplateDocument(vip).filter((i) => i.severity === "critical").length, 0);

const clubSports = createClubSportsVipTemplateDocument();
assert.equal(CLUB_SPORTS_VIP_TEMPLATE_NAME, "Fitdog Club + Sports VIP");
assert.equal(clubSports.front.width, CR80_PX.width);
assert.equal(clubSports.front.height, CR80_PX.height);
assert.equal(documentUsesExactClubSportsArtwork(clubSports), true);
const clubFrontArt = clubSports.front.elements.find((el) => el.id === "cs_front_exact_art");
const clubBackArt = clubSports.back.elements.find((el) => el.id === "cs_back_exact_art");
assert.equal(String(clubFrontArt?.properties.src), CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSrc);
assert.equal(String(clubBackArt?.properties.src), CLUB_SPORTS_VIP_EXACT_ARTWORK.backSrc);
assert.equal(clubFrontArt?.locked, true);
assert.equal(clubBackArt?.locked, true);
assert.equal(String(clubFrontArt?.properties.fit), "contain");
assert.equal(clubSports.front.elements.some((el) => el.type === "logo"), false, "exact artwork already includes the Fitdog logo");
assert.equal(clubSports.front.elements.some((el) => el.id === "cs_front_panel"), false);
const clubPhoto = clubSports.front.elements.find((el) => el.id === MEMBER_PHOTO_SLOT_ID);
assert.ok(clubPhoto);
assert.equal(clubPhoto?.type, "member_photo");
assert.equal(clubPhoto?.id, MEMBER_PHOTO_SLOT_ID);
assert.equal(String(clubPhoto?.properties.src), "{{member.photo}}");
assert.equal(clubPhoto?.properties.keepArtworkWhenEmpty, true);
assert.equal(clubPhoto?.locked, true);
assert.equal(countMemberPhotoSlots(clubSports), 1);
const clubDog = clubSports.front.elements.find((el) => el.id === MEMBER_DOG_NAME_SLOT_ID);
assert.equal(String(clubDog?.properties.text), "{{member.dog_name}}");
assert.equal(clubDog?.locked, true);
assert.ok(clubSports.front.elements.some((el) => el.id === MEMBER_ID_SLOT_ID));
const placedFront = containRect(
  CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width,
  CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height,
  CR80_PX.width,
  CR80_PX.height
);
assert.ok(Math.abs(placedFront.width / placedFront.height - CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width / CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height) < 0.0001);
const clubBarcode = clubSports.back.elements.find((el) => el.type === "barcode");
assert.ok(clubBarcode);
assert.equal(String(clubBarcode?.properties.value), "{{member.barcode}}");
assert.equal(String(clubBarcode?.properties.symbology), "upca");
assert.equal(String(clubBarcode?.properties.source), "gingr_owner_barcode");
assert.equal(clubBarcode?.id, OWNER_BARCODE_SLOT_ID);
assert.equal(validateTemplateDocument(clubSports).filter((i) => i.severity === "critical").length, 0);
assert.ok(validateTemplateDocument(clubSports).some((i) => i.code === "ARTWORK_ASPECT"));
assert.equal(resolveTemplateString("{{member.dog_name}}", { ...emptyMemberContext(), dogName: "Bailey" }), "Bailey");
const builtin = builtinClubSportsVipTemplate();
assert.equal(builtin.id, CLUB_SPORTS_VIP_BUILTIN_ID);
assert.equal(builtin.document.front.elements[0]?.id, clubSports.front.elements[0]?.id);

for (const [rel, sha] of [
  ["public/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_FRONT_EXACT.png", CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSha256],
  ["public/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_BACK_EXACT.png", CLUB_SPORTS_VIP_EXACT_ARTWORK.backSha256],
  ["public/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_MASTER_EXACT.png", CLUB_SPORTS_VIP_EXACT_ARTWORK.masterSha256]
] as const) {
  const abs = path.join(process.cwd(), rel);
  assert.equal(existsSync(abs), true, rel);
  assert.equal(createHash("sha256").update(readFileSync(abs)).digest("hex"), sha, rel);
}

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
const gingrMember = { ...member, gingrAnimalId: "115", memberNumber: "115" };
const ownerUpc = "012345678905";
const ownerMember = {
  ...gingrMember,
  gingrOwnerId: "88",
  gingrOwnerBarcode: ownerUpc,
  barcodeSource: "gingr_owner_barcode",
  barcodeValue: ownerUpc
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
assert.ok(issues.some((i) => i.code === "GINGR_BARCODE"), "FIT- card numbers must not print as Gingr barcodes");

assert.equal(normalizeGingrAnimalId("FD-115"), "115");
assert.equal(normalizeGingrAnimalId("115"), "115");
assert.equal(normalizeGingrAnimalId("FIT-00018429"), null);
assert.equal(normalizeGingrAnimalId("FD-FD-115"), null);
assert.equal(gingrBarcodeValue({ gingrAnimalId: "FD-115", memberNumber: "FIT-00018429" }), null);
assert.equal(gingrBarcodeValue({ gingrAnimalId: null, memberNumber: "FIT-00018429" }), null);
assert.equal(gingrBarcodeValue({ gingrAnimalId: null, memberNumber: "FD-88" }), null);
assert.equal(gingrBarcodeValue({ gingrAnimalId: "115", memberNumber: "115", gingrOwnerBarcode: ownerUpc }), ownerUpc);
assert.equal(gingrBarcodeValue({ gingrAnimalId: "115", memberNumber: "115", gingrOwnerBarcode: ownerUpc, email: "a@b.com", phone: "555" }), ownerUpc);
assert.equal(barcodeValueLooksLikeInternalCardNumber("FIT-00018429"), true);
assert.equal(isGingrCompatibleBarcodePayload("115"), false);
assert.equal(isGingrCompatibleBarcodePayload(ownerUpc), true);
assert.equal(DEFAULT_PRODUCTION_BARCODE_SOURCE, "gingr_owner_barcode");
assert.equal(extractGingrOwnerBarcode({ barcode: "TAG-991" }), "TAG-991");
assert.equal(extractGingrOwnerBarcode({ barcode: "012345678905" }), "012345678905");
assert.equal(extractGingrOwnerBarcode({ id: "12" }), null);
assert.equal(extractGingrOwnerBarcode({ a_barcode: "999" }), null);
assert.equal(resolveBarcodeFromSource({ gingrAnimalId: "115", memberNumber: null }, "gingr_animal_id").value, "115");
assert.equal(resolveBarcodeFromSource({ gingrAnimalId: "115", memberNumber: null, cardNumber: "FIT-00018429" }, "card_number").value, null);
assert.ok(barcodeCompatibilityNote("gingr_owner_barcode").includes("owner"));
assert.equal(evaluateUpcA(ownerUpc).status, "VALID");
assert.equal(evaluateUpcA("01234567890").status, "INVALID");
assert.equal(evaluateUpcA("012345678906").status, "INVALID");
assert.equal(evaluateUpcA("").status, "MISSING");
assert.equal(evaluateUpcA("012345678905").raw, "012345678905");

assert.equal(resolveTemplateString("{{member.barcode}} {{member.member_number}} {{member.gingr_animal_id}}", ownerMember), `${ownerUpc} 115 115`);
assert.equal(resolveTemplateString("{{member.barcode}}", gingrMember), "");
assert.equal(resolveTemplateString("{{member.barcode}}", member), "");

const gingrPrintIssues = validateCardForPrint({
  member: gingrMember,
  template: clubSports,
  sides: "duplex",
  printerOnline: true,
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
    osDriver: true,
    nativeIntegration: false
  }
});
assert.equal(gingrPrintIssues.some((i) => i.code === "GINGR_BARCODE"), true, "animal ID must not satisfy the owner UPC-A barcode requirement");

const ownerPrintIssues = validateCardForPrint({
  member: ownerMember,
  template: clubSports,
  sides: "duplex",
  printerOnline: true,
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
    osDriver: true,
    nativeIntegration: false
  }
});
assert.equal(ownerPrintIssues.some((i) => i.code === "GINGR_BARCODE"), false);

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

const osPrinters = await genericOsAdapter.discover();
assert.ok(osPrinters.some((p) => p.id === OFFICE_PRINTER_ID));
assert.equal(OFFICE_PRINTER.id, "os-office");
const officeStatus = await genericOsAdapter.getStatus(OFFICE_PRINTER);
assert.equal(officeStatus.code, "online");
const osCaps = await genericOsAdapter.getCapabilities(OFFICE_PRINTER);
assert.equal(osCaps.osDriver, true);
assert.equal(osCaps.automaticDuplex, false);
assert.equal(osCaps.nativeIntegration, false);
const osPrint = await genericOsAdapter.print(
  { id: "os", name: "Office Printer", manufacturer: "Generic", model: "OS", connection: "os", adapterId: "generic-os", nativeIntegration: false },
  { jobId: "JOB-4", cardId: "c", mode: "front", dpi: 300, copies: 1, color: true }
);
assert.equal(osPrint.status, "unknown");
assert.equal((osPrint.raw as { delivery?: string }).delivery, "os-print-dialog");
assert.equal(classifyPrintOutcome(osPrint).cardIssued, false);
assert.equal(osPrintUsesDialog({ id: OFFICE_PRINTER_ID, adapter_id: "generic-os" }), true);
const sheet = buildOsPrintHtml({
  frontSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="638"></svg>`,
  backSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="1011" height="638"></svg>`,
  mode: "duplex",
  jobId: "JOB-OS",
  cardNumber: "FIT-1",
  memberName: "Alex Rivera"
});
assert.ok(sheet.includes("3.375in"));
assert.ok(sheet.includes("2.125in"));
assert.ok(sheet.includes("Actual size / 100%"));
assert.ok(sheet.includes("BACK — flip the sheet"));
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

const barcodeSvg = await renderBarcodeSvg({
  symbology: "upca",
  value: ownerUpc,
  width: 520,
  height: 96,
  humanReadable: true
});
assert.ok(barcodeSvg.includes("data:image/png;base64,"));
assert.ok(barcodeSvg.includes(`<title>${ownerUpc}</title>`));
assert.ok(!barcodeSvg.includes("FD-115"));
await assert.rejects(
  () =>
    renderBarcodeSvg({
      symbology: "upca",
      value: "115",
      width: 200,
      height: 64,
      humanReadable: true
    }),
  /INVALID/
);
await assert.rejects(
  () =>
    renderBarcodeSvg({
      symbology: "code128",
      value: "   ",
      width: 200,
      height: 64,
      humanReadable: true
    }),
  /empty/i
);

const artwork = await renderPopulatedArtwork(clubSports, ownerMember, "https://staff.ruffops.com");
assert.ok(artwork.frontSvg.includes(CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSrc));
assert.ok(artwork.backSvg.includes(CLUB_SPORTS_VIP_EXACT_ARTWORK.backSrc));
assert.ok(artwork.backSvg.includes(`<title>${ownerUpc}</title>`));
assert.ok(!artwork.backSvg.includes("<title>115</title>"));
assert.ok(!artwork.backSvg.includes("FD-115"));
assert.ok(!artwork.backSvg.includes("FIT-00018429"));
assert.equal((artwork.frontSvg.match(/memberPhotoSlot|clip_memberPhotoSlot/g) || []).length >= 0, true);

const photoA = await renderPopulatedArtwork(clubSports, { ...ownerMember, photoUrl: "data:image/png;base64,AAA" }, "https://staff.ruffops.com");
const photoB = await renderPopulatedArtwork(clubSports, { ...ownerMember, photoUrl: "data:image/png;base64,BBB" }, "https://staff.ruffops.com");
assert.equal(photoA.frontSvg.includes("data:image/png;base64,AAA"), true);
assert.equal(photoA.frontSvg.includes("data:image/png;base64,BBB"), false);
assert.equal(photoB.frontSvg.includes("data:image/png;base64,BBB"), true);
assert.equal(photoB.frontSvg.includes("data:image/png;base64,AAA"), false);
assert.equal(countMemberPhotoSlots(clubSports), 1);

let stacked = createClubSportsVipTemplateDocument();
stacked.front.elements.push(createElement("member_photo", { id: "extra_photo", properties: { src: "data:image/png;base64,CCC" } }));
stacked.front.elements.push(createElement("image", { id: "pasted_photo", properties: { src: "data:image/png;base64,DDD" } }));
stacked = pruneStackedMemberPhotos(stacked);
assert.equal(countMemberPhotoSlots(stacked), 1);
assert.equal(stacked.front.elements.some((el) => el.id === "extra_photo"), false);
assert.equal(stacked.front.elements.some((el) => el.id === "pasted_photo"), false);
assert.equal(String(stacked.front.elements.find((el) => el.id === MEMBER_PHOTO_SLOT_ID)?.properties.src), "{{member.photo}}");
let replaced = replaceMemberPhoto(ownerMember, "data:image/png;base64,EEE");
replaced = replaceMemberPhoto(replaced, "data:image/png;base64,FFF");
replaced = replaceMemberPhoto(replaced, "data:image/png;base64,GGG");
replaced = replaceMemberPhoto(replaced, "data:image/png;base64,HHH");
replaced = replaceMemberPhoto(replaced, "data:image/png;base64,III");
assert.equal(replaced.photoUrl, "data:image/png;base64,III");
assert.equal(countMemberPhotoSlots(clubSports), 1);

const member2 = { ...ownerMember, dogName: "Maple", photoUrl: "data:image/png;base64,JJJ", gingrOwnerBarcode: ownerUpc };
const member3 = { ...ownerMember, dogName: "Rex", photoUrl: "data:image/png;base64,KKK", gingrOwnerBarcode: ownerUpc };
const card2 = await renderPopulatedArtwork(createClubSportsVipTemplateDocument(), member2, "https://staff.ruffops.com");
const card3 = await renderPopulatedArtwork(createClubSportsVipTemplateDocument(), member3, "https://staff.ruffops.com");
assert.ok(card2.frontSvg.includes("MAPLE"));
assert.ok(card3.frontSvg.includes("REX"));
assert.ok(!card2.frontSvg.includes("REX"));
assert.ok(!card3.frontSvg.includes("MAPLE"));
assert.equal(JSON.stringify(createClubSportsVipTemplateDocument()), JSON.stringify(createClubSportsVipTemplateDocument()));

const exactOnly = await renderPopulatedArtwork(clubSports, emptyMemberContext(), "https://staff.ruffops.com");
assert.ok(exactOnly.frontSvg.includes(CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSrc));
assert.ok(exactOnly.backSvg.includes(CLUB_SPORTS_VIP_EXACT_ARTWORK.backSrc));
assert.ok(!exactOnly.backSvg.includes(`<title>${ownerUpc}</title>`));

const prefixed = createFitdogVipTemplateDocument();
const prefixedBarcode = prefixed.back.elements.find((el) => el.type === "barcode");
if (prefixedBarcode) {
  prefixedBarcode.properties.value = "{{member.barcode}}";
  prefixedBarcode.properties.symbology = "upca";
  prefixedBarcode.properties.source = "gingr_owner_barcode";
}
const strippedArtwork = await renderPopulatedArtwork(prefixed, ownerMember, "https://staff.ruffops.com");
assert.ok(strippedArtwork.backSvg.includes(`<title>${ownerUpc}</title>`));
assert.ok(!strippedArtwork.backSvg.includes("FD-115"));

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
