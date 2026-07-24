export type VetVisitPaidBy = "fitdog" | "owner";
export type VetVisitOwnerFollowUpStatus = "pending" | "due" | "completed";
export type VetVisitManagementStatus = "in_progress" | "resolved";

export type VetVisit = {
  id: string;
  visit_number: string;
  occurred_at: string;
  dog_name: string;
  dog_breed: string | null;
  owner_name: string;
  reason: string;
  vet_clinic: string;
  reported_by: string;
  reported_by_user_id: string | null;
  receipt_url: string | null;
  receipt_label: string | null;
  bill_total_cents: number;
  paid_by: VetVisitPaidBy;
  owner_follow_up_status: VetVisitOwnerFollowUpStatus;
  owner_follow_up_due_at: string | null;
  owner_follow_up_completed_at: string | null;
  management_status: VetVisitManagementStatus;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  linked_owner_follow_up_id: string | null;
  notes: string;
  latest_update: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type VetVisitSummary = {
  total: number;
  inProgress: number;
  resolved: number;
  followUpRequired: number;
};

export type VetVisitListFilters = {
  q?: string;
  managementStatus?: VetVisitManagementStatus | "all";
  ownerFollowUp?: VetVisitOwnerFollowUpStatus | "all";
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};
