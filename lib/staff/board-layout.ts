export type StaffBoardLayoutVariant = "loading" | "dual" | "single-in" | "single-out" | "empty";

export type StaffBoardLayoutState = {
  variant: StaffBoardLayoutVariant;
  hasCheckIns: boolean;
  hasCheckOuts: boolean;
  isSinglePanel: boolean;
  isDualPanel: boolean;
  isEmpty: boolean;
  showCheckInPanel: boolean;
  showCheckOutPanel: boolean;
  showApprovedEmptyState: boolean;
};

/**
 * Derive staff-board layout from visible dog counts after the initial load completes.
 * Call with isLoaded=false while the first fetch is still in flight so the approved
 * empty state is not shown prematurely.
 */
export function getStaffBoardLayoutState(options: {
  checkInCount: number;
  checkOutCount: number;
  isLoaded: boolean;
}): StaffBoardLayoutState {
  const hasCheckIns = options.checkInCount > 0;
  const hasCheckOuts = options.checkOutCount > 0;

  if (!options.isLoaded) {
    return {
      variant: "loading",
      hasCheckIns,
      hasCheckOuts,
      isSinglePanel: false,
      isDualPanel: false,
      isEmpty: false,
      showCheckInPanel: false,
      showCheckOutPanel: false,
      showApprovedEmptyState: false
    };
  }

  const isEmpty = !hasCheckIns && !hasCheckOuts;
  const isDualPanel = hasCheckIns && hasCheckOuts;
  const isSinglePanel = hasCheckIns !== hasCheckOuts;

  let variant: StaffBoardLayoutVariant = "empty";
  if (isDualPanel) variant = "dual";
  else if (hasCheckIns) variant = "single-in";
  else if (hasCheckOuts) variant = "single-out";

  return {
    variant,
    hasCheckIns,
    hasCheckOuts,
    isSinglePanel,
    isDualPanel,
    isEmpty,
    showCheckInPanel: hasCheckIns,
    showCheckOutPanel: hasCheckOuts,
    showApprovedEmptyState: isEmpty
  };
}

/** CSS hook class for the main content grid. */
export function staffBoardLayoutClass(variant: StaffBoardLayoutVariant): string {
  switch (variant) {
    case "dual":
      return "staff-board-content staff-board-content--dual";
    case "single-in":
    case "single-out":
      return "staff-board-content staff-board-content--single";
    case "empty":
      return "staff-board-content staff-board-content--empty";
    default:
      return "staff-board-content staff-board-content--loading";
  }
}
