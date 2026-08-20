/**
 * TEMPORARY server-only fixture for Outstanding Packages CSV owner-id resolution.
 * Eligible labels only. Remove after the Super Admin diagnostic is finished.
 * Never import this module from client components.
 */

import type { PackageGroupWalkPackageKey } from "./eligible-packages";

export type OutstandingPackageCsvOwner = {
  ownerDisplayName: string;
  packageKey: PackageGroupWalkPackageKey;
  packageType: "Monthly Unlimited" | "20-Day PLUS Package";
};

export const OUTSTANDING_PACKAGE_CSV_SOURCE =
  "Outstanding_Packages_Report_2026-8-20_9_43_54_7117.csv";

export const OUTSTANDING_PACKAGE_CSV_OWNERS: readonly OutstandingPackageCsvOwner[] = [
  { ownerDisplayName: "Maryann Gray", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Lynda Cole", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Victoria Lawton", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Nathan Guest", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Nicole Kawakami", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Miguel Delgado", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Ranae Jackson", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Zachary Cohen", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Jennifer Candy-Sullivan", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Lisa Miller", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Stephen Schwartz", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Laura Rogers Baysinger", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "James McCabe", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Drusilla  Bramlett", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Leigh Shane", packageKey: "monthly_unlimited", packageType: "Monthly Unlimited" },
  { ownerDisplayName: "Melanie Santos", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "John  Helmy", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Isabelle Chafkin", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Deven Khosla", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Josephine Roberts", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Nancy Grammatico", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Hollie Stenson", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Daniela Wiener", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Laura Collin", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Christine Claussen", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Daniel Kellison", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Thomas Greenhalgh", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Barrett Carrere", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Matthew Duckor", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "dasha martikainen", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Melissa Piken", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "David  Chou", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Cathy Johnson", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "candice bina", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Molly Thompson", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
  { ownerDisplayName: "Andrea Skogmo", packageKey: "twenty_day_plus", packageType: "20-Day PLUS Package" },
];
