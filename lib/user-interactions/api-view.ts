import type { StaffOpsState } from "@/lib/staff/admin-ops";
import {
  applyUserInteractionFilter,
  buildAllUnifiedInteractions,
  paginateInteractions,
  userInteractionCounts,
  type UserInteractionsActor,
  type UserInteractionsFilter
} from "@/lib/user-interactions/unified";

export type UserInteractionsViewResponse = {
  view: UserInteractionsFilter | "counts";
  interactions: ReturnType<typeof buildAllUnifiedInteractions>;
  counts: ReturnType<typeof userInteractionCounts>;
  page: number;
  maxPage: number;
  pageSize: number;
  total: number;
  currentUser: UserInteractionsActor & { role: string | null };
  permissions: {
    canCreate: boolean;
    canEdit: boolean;
  };
  staffDirectory: StaffOpsState["staff_directory"];
};

export function buildUserInteractionsViewPayload(
  state: StaffOpsState,
  options: {
    view: UserInteractionsFilter;
    search?: string;
    page?: number;
    pageSize?: number;
    actor: UserInteractionsActor & { role: string | null };
    permissions: { canCreate: boolean; canEdit: boolean };
  }
): UserInteractionsViewResponse {
  const all = buildAllUnifiedInteractions(state);
  const directory = state.staff_directory ?? [];
  const counts = userInteractionCounts(all, options.actor, directory);
  const filtered = applyUserInteractionFilter(all, options.view, options.actor, directory, {
    search: options.search
  });
  const pageSize = options.pageSize ?? (options.view === "archive" || options.view === "completed_today" ? 30 : 200);
  const paged = paginateInteractions(filtered, options.page ?? 1, pageSize);
  return {
    view: options.view,
    interactions: paged.rows,
    counts,
    page: paged.page,
    maxPage: paged.maxPage,
    pageSize: paged.pageSize,
    total: paged.total,
    currentUser: options.actor,
    permissions: options.permissions,
    staffDirectory: state.staff_directory ?? []
  };
}

export function parseUserInteractionsViewParam(raw: string | null): UserInteractionsFilter | null {
  if (raw === "open" || raw === "mine" || raw === "overdue" || raw === "archive" || raw === "completed_today") {
    return raw;
  }
  return null;
}
