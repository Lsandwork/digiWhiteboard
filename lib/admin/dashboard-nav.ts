/**
 * Client dashboard tab navigation that does not go through Next.js
 * `useSearchParams` / `router.replace`.
 *
 * Search-param changes inside a Suspense boundary remount AdminDashboard,
 * wipe loaded session state, and the access-check effect then sends people to
 * My Shift. Same-page tab clicks must update history locally and keep React state.
 */

import { useSyncExternalStore } from "react";
import { ADMIN_TABS, parseAdminBoardType, type AdminBoardType, type AdminTab } from "@/lib/admin/types";

export function parseKnownAdminTab(value: string | null | undefined): AdminTab | null {
  if (value && (ADMIN_TABS as readonly string[]).includes(value)) return value as AdminTab;
  return null;
}

export function parseAdminDashboardSearch(search: string): {
  board: AdminBoardType;
  rawBoard: string | null;
  tab: AdminTab | null;
  extra: Record<string, string>;
} {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const extra: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key === "board" || key === "tab") continue;
    extra[key] = value;
  }
  return {
    board: parseAdminBoardType(sp.get("board")),
    rawBoard: sp.get("board"),
    tab: parseKnownAdminTab(sp.get("tab")),
    extra
  };
}

export function buildAdminDashboardHref(
  board: AdminBoardType,
  tab: AdminTab,
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams({ board, tab });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/admin?${params.toString()}`;
}

const navListeners = new Set<() => void>();

function notifyAdminNavListeners() {
  for (const listener of navListeners) listener();
}

function subscribeAdminNav(onStoreChange: () => void) {
  navListeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", onStoreChange);
  }
  return () => {
    navListeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("popstate", onStoreChange);
    }
  };
}

function readAdminNavSearch() {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

export function navigateAdminDashboard(
  board: AdminBoardType,
  tab: AdminTab,
  extra?: Record<string, string>
): string {
  const href = buildAdminDashboardHref(board, tab, extra);
  if (typeof window === "undefined") return href;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== href) {
    window.history.pushState(window.history.state, "", href);
  }
  notifyAdminNavListeners();
  return href;
}

export function useAdminDashboardLocation() {
  const search = useSyncExternalStore(subscribeAdminNav, readAdminNavSearch, () => "");
  return parseAdminDashboardSearch(search);
}
