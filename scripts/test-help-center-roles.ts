import assert from "node:assert/strict";
import {
  filterHelpArticlesForRole,
  articleVisibleToRole,
  HELP_ARTICLES
} from "@/lib/admin/help-content";
import type { AdminUserRole } from "@/lib/admin/users";

const ALL_ROLES: AdminUserRole[] = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "marketing",
  "viewer"
];

const REQUIRED_FOR_EVERYONE = ["first-login", "change-password", "troubleshoot-login", "what-is-this"] as const;

const REQUIRED_BY_ROLE: Record<AdminUserRole, string[]> = {
  owner_admin: [
    "env-vars",
    "front-desk-log",
    "fitdog-alerts-help",
    "add-admin-user",
    "viewer-basics",
    "ops-command-center-help",
    "grooming-push-help",
    "commissions-help",
    "route-generator-help"
  ],
  manager_admin: [
    "env-vars",
    "front-desk-log",
    "fitdog-alerts-help",
    "add-admin-user",
    "viewer-basics",
    "ops-command-center-help",
    "grooming-push-help",
    "commissions-help",
    "route-generator-help"
  ],
  assistant_manager: [
    "front-desk-log",
    "management-role",
    "staff-ops-pages",
    "fitdog-alerts-help",
    "ops-command-center-help",
    "commissions-help",
    "route-generator-help"
  ],
  front_desk_coordinator: [
    "front-desk-log",
    "front-desk-coordinator",
    "staff-ops-pages",
    "fitdog-alerts-help",
    "ops-command-center-help",
    "route-generator-help"
  ],
  team_leader: [
    "front-desk-log",
    "front-desk-coordinator",
    "staff-ops-pages",
    "fitdog-alerts-help",
    "ops-command-center-help",
    "route-generator-help"
  ],
  groomer: ["front-desk-log", "groomer-trainer-crossover", "grooming-push-help", "ops-command-center-help"],
  trainer: ["front-desk-log", "groomer-trainer-crossover", "commissions-help", "ops-command-center-help"],
  daycare: ["front-desk-log", "dog-handler-basics", "ops-command-center-help"],
  driver: ["front-desk-log", "dog-handler-basics", "ops-command-center-help"],
  hiker: ["front-desk-log", "dog-handler-basics", "ops-command-center-help"],
  marketing: ["marketing-account", "lobby-promotions", "lobby-tv-cast", "what-is-this"],
  viewer: ["lobby-messages", "lobby-tv-cast", "viewer-basics", "what-is-this"]
};

for (const role of ALL_ROLES) {
  const visible = filterHelpArticlesForRole(role);
  assert.ok(visible.length > 0, `${role} must see at least one help article`);

  const ids = new Set(visible.map((article) => article.id));
  for (const articleId of REQUIRED_FOR_EVERYONE) {
    assert.ok(ids.has(articleId), `${role} must see ${articleId}`);
  }
  for (const articleId of REQUIRED_BY_ROLE[role]) {
    assert.ok(ids.has(articleId), `${role} must see ${articleId}`);
  }
}

assert.equal(
  articleVisibleToRole(HELP_ARTICLES.find((a) => a.id === "env-vars")!, "daycare"),
  false,
  "dog handler must not see admin-only env-vars"
);

assert.equal(
  articleVisibleToRole(HELP_ARTICLES.find((a) => a.id === "env-vars")!, "driver"),
  false,
  "driver/hiker must not see admin-only env-vars"
);

assert.equal(
  articleVisibleToRole(HELP_ARTICLES.find((a) => a.id === "add-admin-user")!, "marketing"),
  false,
  "marketing must not see add-admin-user"
);

assert.equal(
  articleVisibleToRole(HELP_ARTICLES.find((a) => a.id === "front-desk-log")!, "assistant_manager"),
  true,
  "assistant manager must see team log help"
);

console.log(
  `help-center-roles: ok (${ALL_ROLES.length} roles, ${HELP_ARTICLES.length} articles)`
);
