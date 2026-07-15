type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { listCommissionRecords } from "./records";
import { centsToDisplay } from "./money";
import type { CommissionListFilters, CommissionViewer, PackageCommissionRecord } from "./types";

export type CommissionReportType =
  | "trainer_statement"
  | "package_summary"
  | "class_summary"
  | "pending_approval"
  | "refund_report"
  | "date_range";

export type CommissionReportTotals = {
  records: number;
  grossSalesCents: number;
  commissionCents: number;
  refundCents: number;
  grossSales: string;
  commission: string;
  refund: string;
};

export type CommissionReportTrainerRow = {
  trainerUserId: string | null;
  trainerName: string;
  trainerEmail: string | null;
  records: number;
  grossSalesCents: number;
  commissionCents: number;
  grossSales: string;
  commission: string;
};

export type CommissionReportTypeRow = {
  commissionType: string;
  records: number;
  grossSalesCents: number;
  commissionCents: number;
  grossSales: string;
  commission: string;
};

export type CommissionReport = {
  reportType: CommissionReportType;
  title: string;
  generatedAt: string;
  dateRange: { from: string | null; to: string | null; field: string };
  totals: CommissionReportTotals;
  byTrainer: CommissionReportTrainerRow[];
  byType: CommissionReportTypeRow[];
  rows: PackageCommissionRecord[];
};

function reportTitle(type: CommissionReportType) {
  switch (type) {
    case "trainer_statement":
      return "Trainer Commission Statement";
    case "package_summary":
      return "Package Commission Summary";
    case "class_summary":
      return "Class Commission Summary";
    case "pending_approval":
      return "Pending Approval Report";
    case "refund_report":
      return "Refund and Reversal Report";
    default:
      return "Commission Report by Date Range";
  }
}

function filtersForReportType(type: CommissionReportType, filters: CommissionListFilters): CommissionListFilters {
  const next = { ...filters, page: 1, pageSize: 5000 };
  if (type === "pending_approval") {
    next.approvalStatus = ["pending"];
  }
  if (type === "refund_report") {
    next.refundStatus = ["partial", "full", "pending"];
  }
  if (type === "package_summary") {
    next.commissionTypes = ["package_sale"];
  }
  if (type === "class_summary") {
    next.commissionTypes = ["group_class", "private_session"];
  }
  return next;
}

function sumRows(rows: PackageCommissionRecord[]) {
  let grossSalesCents = 0;
  let commissionCents = 0;
  let refundCents = 0;
  for (const row of rows) {
    grossSalesCents += row.gross_amount_cents;
    commissionCents += row.final_commission_cents;
    refundCents += row.refund_amount_cents;
  }
  return {
    records: rows.length,
    grossSalesCents,
    commissionCents,
    refundCents,
    grossSales: centsToDisplay(grossSalesCents),
    commission: centsToDisplay(commissionCents),
    refund: centsToDisplay(refundCents)
  };
}

export async function buildCommissionReport(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  filters: CommissionListFilters = {},
  reportType: CommissionReportType = "trainer_statement"
): Promise<CommissionReport> {
  const scopedFilters = filtersForReportType(reportType, filters);
  const result = await listCommissionRecords(supabase, viewer, scopedFilters);
  const rows = result.rows;

  const byTrainerMap = new Map<string, CommissionReportTrainerRow>();
  for (const row of rows) {
    const key = row.trainer_user_id ?? row.trainer_name;
    const existing = byTrainerMap.get(key) ?? {
      trainerUserId: row.trainer_user_id,
      trainerName: row.trainer_name,
      trainerEmail: row.trainer_email,
      records: 0,
      grossSalesCents: 0,
      commissionCents: 0,
      grossSales: "$0.00",
      commission: "$0.00"
    };
    existing.records += 1;
    existing.grossSalesCents += row.gross_amount_cents;
    existing.commissionCents += row.final_commission_cents;
    existing.grossSales = centsToDisplay(existing.grossSalesCents);
    existing.commission = centsToDisplay(existing.commissionCents);
    byTrainerMap.set(key, existing);
  }

  const byTypeMap = new Map<string, CommissionReportTypeRow>();
  for (const row of rows) {
    const key = row.commission_type;
    const existing = byTypeMap.get(key) ?? {
      commissionType: key,
      records: 0,
      grossSalesCents: 0,
      commissionCents: 0,
      grossSales: "$0.00",
      commission: "$0.00"
    };
    existing.records += 1;
    existing.grossSalesCents += row.gross_amount_cents;
    existing.commissionCents += row.final_commission_cents;
    existing.grossSales = centsToDisplay(existing.grossSalesCents);
    existing.commission = centsToDisplay(existing.commissionCents);
    byTypeMap.set(key, existing);
  }

  return {
    reportType,
    title: reportTitle(reportType),
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: filters.dateFrom ?? null,
      to: filters.dateTo ?? null,
      field: filters.dateField ?? "sale_date"
    },
    totals: sumRows(rows),
    byTrainer: [...byTrainerMap.values()].sort((a, b) => b.commissionCents - a.commissionCents),
    byType: [...byTypeMap.values()].sort((a, b) => b.commissionCents - a.commissionCents),
    rows
  };
}

export function commissionReportToCsv(report: CommissionReport) {
  const header = [
    "trainer",
    "sale_date",
    "client",
    "dog",
    "commission_type",
    "package_or_class",
    "gross",
    "final_commission",
    "approval_status",
    "payment_status"
  ].join(",");
  const lines = report.rows.map((row) =>
    [
      row.trainer_name,
      row.sale_date ?? "",
      row.client_name,
      row.dog_name,
      row.commission_type,
      row.package_or_class,
      centsToDisplay(row.gross_amount_cents),
      centsToDisplay(row.final_commission_cents),
      row.approval_status,
      row.payment_status
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}
