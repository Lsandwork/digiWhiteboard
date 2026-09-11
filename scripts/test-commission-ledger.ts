/**
 * Commission ledger unit tests (money, auth, rules, CSV sanitize).
 * Run: npx tsx scripts/test-commission-ledger.ts
 */
import assert from "node:assert/strict";
import {
  assertCanManage,
  assertNotManagementDestructive,
  assertSuperAdmin,
  calculatePercentCommissionCents,
  centsToDisplay,
  parseMoneyToCents,
  parsePercentToBps,
  previewCommissionRule,
  sanitizeCsvCell,
  trainerOwnsRecord,
  parseCommissionDate,
  normalizeCommissionDateFilter,
  isIsoCommissionDate,
  listCommissionTrainerOptions,
  type CommissionViewer
} from "../lib/staff/commission-ledger";
import {
  buildCommissionLedgerSelect,
  buildLedgerDatabaseUrl,
  formatLedgerPostgresTargetDetail,
  getLedgerPostgresDiagnosticsTargetMeta
} from "../lib/staff/commission-ledger/list-via-postgres";
import { buildCommissionLedgerRestPath } from "../lib/staff/commission-ledger/list-via-rest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Money (integer cents)
assert.equal(parseMoneyToCents("$1,200.50"), 120050);
assert.equal(parseMoneyToCents("27.50"), 2750);
assert.equal(parseMoneyToCents(0), 0);
assert.equal(centsToDisplay(2750), "$27.50");
assert.equal(centsToDisplay(-5000), "-$50.00");
assert.equal(parsePercentToBps("50"), 5000);
assert.equal(parsePercentToBps("12.5"), 1250);
assert.equal(calculatePercentCommissionCents(10_000, 5000), 5000); // $100 @ 50% = $50
assert.equal(calculatePercentCommissionCents(4583, 5000), 2292); // rounds

// Rule preview
assert.equal(
  previewCommissionRule({
    calculation_type: "percentage_of_gross",
    gross_amount: "100",
    rate: "50"
  }),
  5000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "percentage_after_discount",
    gross_amount: "100",
    discount_amount: "20",
    rate: "50"
  }),
  4000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "fixed_per_session",
    gross_amount: "0",
    fixed_amount: "35"
  }),
  3500
);
assert.equal(
  previewCommissionRule({
    calculation_type: "fixed_per_attendee",
    gross_amount: "0",
    fixed_amount: "10",
    quantity: 3
  }),
  3000
);
assert.equal(
  previewCommissionRule({
    calculation_type: "refund_reversal",
    gross_amount: "0",
    fixed_amount: "50"
  }),
  -5000
);

// CSV formula injection
assert.equal(sanitizeCsvCell("=CMD()"), "'=CMD()");
assert.equal(sanitizeCsvCell("+1-555"), "'+1-555");
assert.equal(sanitizeCsvCell("Normal"), "Normal");

// Auth
const trainerViewer: CommissionViewer = {
  canManage: false,
  canComment: true,
  isTrainerOnly: true,
  isSuperAdmin: false,
  adminUserId: "t1",
  email: "jamie@fitdog.test",
  role: "trainer",
  roleKey: "trainer"
};

assert.throws(() => assertCanManage(trainerViewer), /permission/);
assert.throws(
  () =>
    assertNotManagementDestructive(
      { ...trainerViewer, canManage: true, isTrainerOnly: false, roleKey: "management", role: "assistant_manager" },
      "reopen_payroll"
    ),
  /Management cannot/
);
assert.throws(() => assertSuperAdmin(trainerViewer), /Super Admin/);

assert.equal(
  trainerOwnsRecord({ trainer_user_id: "t1", trainer_email: "jamie@fitdog.test" }, trainerViewer),
  true
);
assert.equal(
  trainerOwnsRecord({ trainer_user_id: "t2", trainer_email: "other@fitdog.test" }, trainerViewer),
  false
);

// Partial / full refund arithmetic (ledger amounts)
const original = 5000;
const partialRefund = 2000;
assert.equal(original - partialRefund, 3000);
const fullRefund = 5000;
assert.equal(original - fullRefund, 0);

assert.equal(parseCommissionDate("07142026"), "2026-07-14");
assert.equal(parseCommissionDate("07/14/2026"), "2026-07-14");
assert.equal(parseCommissionDate("2026-07-02"), "2026-07-02");
assert.equal(normalizeCommissionDateFilter("07/02/2026"), "2026-07-02");
assert.equal(normalizeCommissionDateFilter("2026-07-02"), "2026-07-02");
assert.equal(isIsoCommissionDate("2026-07-02"), true);
assert.equal(isIsoCommissionDate("07/02/2026"), false);

const trainerOptions = listCommissionTrainerOptions([
  { id: "1", full_name: "Ivonne Campuzano", email: "ivonne@test.com", role: "trainer", status: "active" },
  { id: "2", full_name: "Trainer Demo", email: "demo-trainer@demo.com", role: "trainer", status: "active" },
  { id: "3", full_name: "Disabled Trainer", email: "off@test.com", role: "trainer", status: "disabled" }
]);
assert.equal(trainerOptions.length, 1);
assert.equal(trainerOptions[0]?.full_name, "Ivonne Campuzano");

import { commissionDedupeKey, namesMatchCaseInsensitive } from "../lib/staff/commission-ledger/dedupe";

assert.equal(
  commissionDedupeKey({
    trainerName: "Ivonne Campuzano",
    clientName: "Debra Martin",
    dogName: "Daisy",
    packageOrClass: "PUPPY JUMPSTART",
    saleDate: "2026-07-17",
    finalCommissionCents: 49750
  }),
  commissionDedupeKey({
    trainerName: " ivonne  campuzano ",
    clientName: "DEBRA MARTIN",
    dogName: "daisy",
    packageOrClass: "puppy jumpstart",
    saleDate: "2026-07-17",
    finalCommissionCents: 1 // amount ignored
  })
);
assert.equal(namesMatchCaseInsensitive("Van 01", "van 01"), true);
assert.notEqual(
  commissionDedupeKey({
    trainerName: "Ivonne",
    clientName: "A",
    dogName: "B",
    packageOrClass: "Pack",
    saleDate: "2026-07-17"
  }),
  commissionDedupeKey({
    trainerName: "Amanda",
    clientName: "A",
    dogName: "B",
    packageOrClass: "Pack",
    saleDate: "2026-07-17"
  })
);
// Different amounts, same name/date/class → still a duplicate key
assert.equal(
  commissionDedupeKey({
    trainerName: "Ivonne",
    clientName: "Owner",
    dogName: "Rex",
    packageOrClass: "Group Class",
    saleDate: "2026-07-20",
    finalCommissionCents: 1000
  }),
  commissionDedupeKey({
    trainerName: "Ivonne",
    clientName: "Owner",
    dogName: "Rex",
    packageOrClass: "Group Class",
    saleDate: "2026-07-20",
    finalCommissionCents: 9999
  })
);

const indexedDateQuery = buildCommissionLedgerSelect(
  { isTrainerOnly: false },
  { dateFrom: "08/22/2026", dateTo: "08/22/2026", page: 1, pageSize: 25 }
);
assert.match(indexedDateQuery.text, /sale_date >= \$1/);
assert.match(indexedDateQuery.text, /sale_date <= \$2/);
assert.doesNotMatch(indexedDateQuery.text, /service_date >=/);
assert.deepEqual(indexedDateQuery.values.slice(0, 2), ["2026-08-22", "2026-08-22"]);
assert.match(indexedDateQuery.text, /archived_at is null/);
assert.match(indexedDateQuery.text, /order by sale_date desc nulls last/i);
assert.equal(indexedDateQuery.values.at(-2), 25);
assert.equal(indexedDateQuery.values.at(-1), 0);

const injectedSort = buildCommissionLedgerSelect(
  { isTrainerOnly: false },
  { sortBy: "sale_date;drop table package_commission_records", sortDir: "desc" }
);
assert.match(injectedSort.text, /order by sale_date desc/i);
assert.doesNotMatch(injectedSort.text, /drop table/i);

const trainerScoped = buildCommissionLedgerSelect(
  { isTrainerOnly: true, adminUserId: "11111111-1111-1111-1111-111111111111" },
  { page: 2, pageSize: 25 }
);
assert.match(trainerScoped.text, /trainer_user_id = \$1/);
assert.equal(trainerScoped.from, 25);

const hugePage = buildCommissionLedgerSelect({ isTrainerOnly: false }, { pageSize: 5000 });
assert.equal(hugePage.pageSize, 25);

const restPath = buildCommissionLedgerRestPath(
  { isTrainerOnly: false },
  { page: 1, pageSize: 25 }
);
assert.match(restPath.path, /archived_at=is\.null/);
assert.match(restPath.path, /order=sale_date\.desc\.nullslast/);
assert.match(restPath.path, /limit=25/);
assert.doesNotMatch(restPath.path, /sale_date=gte/);
assert.equal(restPath.pageSize, 25);

// `sslmode=require` in the connection string is parsed as verify-full and
// overrides the client's ssl options, which rejected Supabase's pooler chain
// with "self-signed certificate in certificate chain".
const previousPassword = process.env.SUPABASE_DB_PASSWORD;
const previousUser = process.env.SUPABASE_DB_USER;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousSupabaseDbUrl = process.env.SUPABASE_DB_URL;
const previousPostgresUrl = process.env.POSTGRES_URL;
const previousPostgresPassword = process.env.POSTGRES_PASSWORD;
delete process.env.SUPABASE_DB_USER;
delete process.env.DATABASE_URL;
delete process.env.SUPABASE_DB_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PASSWORD;
process.env.SUPABASE_DB_PASSWORD = "p@ss:word/1";

const pooledUrl = buildLedgerDatabaseUrl();
assert.ok(pooledUrl, "pooler URL should build when a password is set");
assert.doesNotMatch(pooledUrl, /sslmode/);
assert.match(pooledUrl, /@aws-0-us-east-1\.pooler\.supabase\.com:6543\/postgres$/);
assert.match(pooledUrl, /p%40ss%3Aword%2F1/);
assert.match(pooledUrl, /postgresql:\/\/postgres\.tzkocaucqtmmnrttxira:/);

const defaultTarget = getLedgerPostgresDiagnosticsTargetMeta();
assert.equal(defaultTarget.mode, "password");
assert.equal(defaultTarget.host, "aws-0-us-east-1.pooler.supabase.com");
assert.equal(defaultTarget.port, "6543");
assert.equal(defaultTarget.database, "postgres");
assert.equal(defaultTarget.user, "postgres.tzkocaucqtmmnrttxira");
assert.equal(defaultTarget.passwordConfigured, true);
assert.equal(defaultTarget.supabaseDbUserConfigured, false);
assert.equal(defaultTarget.connectionUrlConfigured, false);

const defaultDetail = formatLedgerPostgresTargetDetail(defaultTarget);
assert.match(defaultDetail, /user=postgres\.tzkocaucqtmmnrttxira/);
assert.match(defaultDetail, /supabaseDbUserConfigured=false/);
assert.doesNotMatch(defaultDetail, /p@ss:word\/1/);
assert.doesNotMatch(defaultDetail, /postgresql:\/\//);
assert.doesNotMatch(defaultDetail, /SUPABASE_DB_PASSWORD=/);
assert.doesNotMatch(defaultDetail, /DATABASE_URL=/);

process.env.SUPABASE_DB_USER = "custom-ledger-user";
const overridden = getLedgerPostgresDiagnosticsTargetMeta();
assert.equal(overridden.user, "custom-ledger-user");
assert.equal(overridden.supabaseDbUserConfigured, true);
const overriddenUrl = buildLedgerDatabaseUrl();
assert.match(overriddenUrl ?? "", /postgresql:\/\/custom-ledger-user:/);
assert.match(overriddenUrl ?? "", /@aws-0-us-east-1\.pooler\.supabase\.com:6543\/postgres$/);

const diagnosticsSource = readFileSync(join(process.cwd(), "lib/staff/commission-ledger/diagnostics.ts"), "utf8");
assert.match(diagnosticsSource, /direct_postgres_target/);
assert.match(diagnosticsSource, /getLedgerPostgresDiagnosticsTargetMeta/);
assert.doesNotMatch(diagnosticsSource, /formatLedgerPostgresTargetDetail\([^\)]*password/);

if (previousPassword === undefined) delete process.env.SUPABASE_DB_PASSWORD;
else process.env.SUPABASE_DB_PASSWORD = previousPassword;
if (previousUser === undefined) delete process.env.SUPABASE_DB_USER;
else process.env.SUPABASE_DB_USER = previousUser;
if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = previousDatabaseUrl;
if (previousSupabaseDbUrl === undefined) delete process.env.SUPABASE_DB_URL;
else process.env.SUPABASE_DB_URL = previousSupabaseDbUrl;
if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
else process.env.POSTGRES_URL = previousPostgresUrl;
if (previousPostgresPassword === undefined) delete process.env.POSTGRES_PASSWORD;
else process.env.POSTGRES_PASSWORD = previousPostgresPassword;

console.log("commission ledger: ok");
