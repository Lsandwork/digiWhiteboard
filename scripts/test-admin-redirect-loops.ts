/**
 * Guards against infinite /admin redirect loops (Safari reports these as a
 * crashed / "too many redirects" page). Mirrors the /admin redirect ordering in
 * middleware.ts and walks the chain until it settles.
 */
import assert from "node:assert/strict";
import {
  firstAccessibleAdminTab,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole
} from "../lib/admin/permissions";
import { shouldForceFitdogStaffBoard } from "../lib/fitdog-domain";

type Location = { pathname: string; board: string | null; tab: string | null };

/** One middleware pass over /admin. Returns the redirect target, or null to serve. */
function adminRedirectStep(
  host: string,
  location: Location,
  role: string,
  isDemo = false
): Location | null {
  const { pathname } = location;
  let { board, tab } = location;

  if (shouldForceFitdogStaffBoard(host, pathname, board)) {
    const next: Location = { pathname: "/admin", board: "staff", tab };
    if (!next.tab) {
      next.tab = isDemo ? "demo_push" : firstAccessibleAdminTab(null, role, "staff");
    }
    return next;
  }

  if (pathname === "/admin") {
    if (!tab && board !== "marketing" && board !== "lobby") {
      return { pathname, board: "staff", tab: firstAccessibleAdminTab(null, role, "staff") };
    }
    if (!tab && board === "staff") {
      return { pathname, board, tab: firstAccessibleAdminTab(null, role, "staff") };
    }
  }

  if (!isDemo && isStaffDigiBoardOnlyLegacyRole(role)) {
    if (board !== "staff" || !tab) {
      return {
        pathname: "/admin",
        board: "staff",
        tab: tab ?? firstAccessibleAdminTab(null, role, "staff")
      };
    }
  }

  if (!isDemo && isLobbyDigiBoardOnlyLegacyRole(role)) {
    const marketingStaffTabs = ["crossover_communication", "bulk_photo_upload", "media_library", "help"];
    if (board === "staff" && (tab === null || marketingStaffTabs.includes(tab))) {
      if (!tab) {
        return { pathname: "/admin", board: "staff", tab: "crossover_communication" };
      }
      return null;
    }
    if (board === "staff") {
      return { pathname: "/admin", board: "marketing", tab: tab ?? "cast_tv" };
    }
    if (board !== "lobby" && board !== "marketing") {
      return {
        pathname: "/admin",
        board: "lobby",
        tab: tab ?? firstAccessibleAdminTab(null, role, "lobby")
      };
    }
  }

  return null;
}

function key(location: Location) {
  return `${location.pathname}?board=${location.board ?? ""}&tab=${location.tab ?? ""}`;
}

function walk(host: string, start: Location, role: string, isDemo = false) {
  const seen: string[] = [];
  let current = start;
  for (let hop = 0; hop < 12; hop += 1) {
    const id = key(current);
    if (seen.includes(id)) {
      throw new Error(
        `redirect loop for role="${role}" host="${host}" from ${key(start)}:\n  ${[...seen, id].join("\n  ")}`
      );
    }
    seen.push(id);
    const next = adminRedirectStep(host, current, role, isDemo);
    if (!next) return { settled: current, hops: seen.length - 1 };
    current = next;
  }
  throw new Error(`redirect did not settle for role="${role}" from ${key(start)}: ${seen.join(" -> ")}`);
}

const ROLES = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "management",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "marketing",
  "viewer",
  ""
];

const BOARDS: (string | null)[] = [null, "staff", "lobby", "marketing"];
const TABS: (string | null)[] = [
  null,
  "crossover_communication",
  "my_shift",
  "overview",
  "push_notices",
  "cast_tv",
  "media_library",
  "help",
  "route_generator",
  "lobby_messages"
];

for (const host of ["fitdog.ruffops.com", "staff.ruffops.com"]) {
  for (const role of ROLES) {
    for (const board of BOARDS) {
      for (const tab of TABS) {
        walk(host, { pathname: "/admin", board, tab }, role);
      }
    }
    walk(host, { pathname: "/admin", board: null, tab: null }, role, true);
  }
}

// Bare /admin on the Fitdog host still lands on the staff board.
{
  const { settled } = walk("fitdog.ruffops.com", { pathname: "/admin", board: null, tab: null }, "owner_admin");
  assert.equal(settled.board, "staff", "fitdog bare /admin lands on the staff board");
  assert.ok(settled.tab, "fitdog bare /admin picks a landing tab");
}

// Marketing can still reach its own board on the Fitdog host.
{
  const { settled } = walk(
    "fitdog.ruffops.com",
    { pathname: "/admin", board: "marketing", tab: "cast_tv" },
    "marketing"
  );
  assert.equal(settled.board, "marketing", "marketing keeps the marketing board on fitdog host");
}

// Admins can still open the lobby board on the Fitdog host.
{
  const { settled } = walk(
    "fitdog.ruffops.com",
    { pathname: "/admin", board: "lobby", tab: "lobby_messages" },
    "owner_admin"
  );
  assert.equal(settled.board, "lobby", "admins can still open the lobby board on fitdog host");
}

console.log("admin redirect loop tests passed");
