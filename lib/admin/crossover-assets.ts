import { FITDOG_UI } from "@/lib/fitdog-dashboard/assets";

export const CROSSOVER_ASSETS = {
  chat: FITDOG_UI.frontDeskLog,
  envelope: FITDOG_UI.frontDeskLog,
  documents: FITDOG_UI.openItems,
  clock: FITDOG_UI.dueToday,
  refresh: FITDOG_UI.refresh,
  search: FITDOG_UI.search,
  eye: FITDOG_UI.view,
  check: FITDOG_UI.resolved,
  more: FITDOG_UI.more,
  sendPlane: FITDOG_UI.pushNotices
} as const;
