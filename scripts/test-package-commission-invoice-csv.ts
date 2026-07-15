/**
 * Gingr trainers-invoice CSV → package commission mapping.
 * Run: npx tsx scripts/test-package-commission-invoice-csv.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  matchTrainerByName,
  parseCsvLine,
  parsePackageCommissionCsv
} from "../lib/staff/package-commissions";

const SAMPLE_PATH = resolve(
  "/Users/fitdog/Desktop/financial-trainers-invoice-report-06_29_26-07_14_26.csv"
);

const SAMPLE_FALLBACK = `Amanda Smith Nguyen
Date,Owner's Name,Dog's Name,Class/Program,Price ($),Discount ($),Sales ($),Trainer Commission (%),Trainer Share ($)
07/02/2026,Jeffrey Thomashow,JoJo,Fun & Fit Agility,$55.00,$0.00,$55.00,50.00%,$27.50
07/02/2026,Stacy Shirk,"Brontë, Pup",Fun & Fit Agility,$45.83,$0.00,$45.83,50.00%,$22.91
07/06/2026,Victoria Gold,Atlas,Foundations & Focus,$0.00,$0.00,$0.00,50.00%,$0.00
Total Due,,,,,,,,$95.41
`;

function loadSample() {
  try {
    return readFileSync(SAMPLE_PATH, "utf8");
  } catch {
    return SAMPLE_FALLBACK;
  }
}

// Quoted comma safety
assert.deepEqual(parseCsvLine('a,"b, c",d'), ["a", "b, c", "d"]);
assert.deepEqual(parseCsvLine('"$1,200.50",x'), ["$1,200.50", "x"]);

const trainers = [
  { id: "t-amanda", full_name: "Amanda Smith Nguyen", email: "amanda@fitdog.example" },
  { id: "t-other", full_name: "Jordan Lee", email: "jordan@fitdog.example" }
];

assert.equal(matchTrainerByName("Amanda Smith Nguyen", trainers)?.id, "t-amanda");
assert.equal(matchTrainerByName("amanda smith nguyen", trainers)?.email, "amanda@fitdog.example");
assert.equal(matchTrainerByName("Nobody", trainers), null);

const sample = loadSample();
const parsed = parsePackageCommissionCsv(sample, { trainers });

assert.equal(parsed.length, 21, `expected 21 invoice rows, got ${parsed.length}`);
assert.ok(
  parsed.every((row) => row.trainer_name === "Amanda Smith Nguyen"),
  "trainer section name should apply to every row"
);
assert.ok(
  parsed.every((row) => row.trainer_user_id === "t-amanda"),
  "trainer should resolve to admin user id"
);
assert.ok(
  parsed.every((row) => row.sale_category === "class"),
  "Class/Program rows should map to sale_category class"
);
assert.ok(
  parsed.every((row) => row.commission_mode === "amount"),
  "invoice import uses amount mode from Trainer Share"
);

const jojo = parsed.find((row) => row.dog_name === "JoJo");
assert.ok(jojo, "JoJo row missing");
assert.equal(jojo?.owner_name, "Jeffrey Thomashow");
assert.equal(jojo?.package_type, "Fun & Fit Agility");
assert.equal(jojo?.sold_at, "07/02/2026");
assert.equal(jojo?.package_sale_amount, "$55.00");
assert.equal(String(jojo?.commission_percent ?? "").replace(/%/g, ""), "50.00");
assert.equal(jojo?.commission_amount, "$27.50");

const atlas = parsed.find((row) => row.dog_name === "Atlas" && row.sold_at === "07/06/2026");
assert.ok(atlas, "Atlas $0 row missing");
assert.equal(atlas?.commission_amount, "$0.00");
assert.equal(atlas?.package_sale_amount, "$0.00");

assert.equal(
  parsed.some((row) => String(row.dog_name).toLowerCase().includes("total")),
  false,
  "Total Due must be skipped"
);

// Quoted dog name with comma
const quoted = parsePackageCommissionCsv(SAMPLE_FALLBACK, { trainers });
assert.equal(quoted.length, 3);
assert.equal(quoted[1]?.dog_name, "Brontë, Pup");
assert.equal(quoted[2]?.commission_amount, "$0.00");

// Multi-trainer sections
const multi = parsePackageCommissionCsv(
  `Amanda Smith Nguyen
Date,Owner's Name,Dog's Name,Class/Program,Price ($),Discount ($),Sales ($),Trainer Commission (%),Trainer Share ($)
07/02/2026,Owner A,Dog A,Cool Tricks,$55.00,$0.00,$55.00,50.00%,$27.50
Total Due,,,,,,,,$27.50
Jordan Lee
Date,Owner's Name,Dog's Name,Class/Program,Price ($),Discount ($),Sales ($),Trainer Commission (%),Trainer Share ($)
07/03/2026,Owner B,Dog B,Trail Foundations,$60.00,$0.00,$60.00,50.00%,$30.00
Total Due,,,,,,,,$30.00
`,
  { trainers }
);
assert.equal(multi.length, 2);
assert.equal(multi[0]?.trainer_user_id, "t-amanda");
assert.equal(multi[1]?.trainer_user_id, "t-other");
assert.equal(multi[1]?.dog_name, "Dog B");

// Legacy Fitdog header CSV still works
const legacy = parsePackageCommissionCsv(
  `dog_name,owner_name,trainer_name,trainer_email,sale_category,package_type,gingr_transaction_link,commission_amount,date_package_sold,status,notes
Buddy,Sam Owner,Jordan Lee,jordan@fitdog.example,package,Daycare Pack,,$40.00,2026-07-01,Pending,from legacy
`,
  { trainers }
);
assert.equal(legacy.length, 1);
assert.equal(legacy[0]?.dog_name, "Buddy");
assert.equal(legacy[0]?.trainer_user_id, "t-other");
assert.equal(legacy[0]?.sale_category, "package");

console.log("package-commission-invoice-csv: all tests passed");
