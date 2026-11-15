/**
 * Manage Team Engagement premium chrome — source invariants (no invalid JSX, key actions wired).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function main() {
  const leadership = read("components/admin/team-engagement/LeadershipManagementViews.tsx");
  const pack = read("components/admin/team-engagement/pack/PackLeadershipViews.tsx");
  const panel = read("components/admin/team-engagement/TeamEngagementPanel.tsx");

  assert.ok(!/<\s*motion[\s>]/i.test(leadership), "LeadershipManagementViews must not contain invalid <motion> tags");
  assert.ok(!/<\s*motion[\s>]/i.test(pack), "PackLeadershipViews must not contain invalid <motion> tags");

  assert.match(leadership, /archive_announcement/, "Announcements admin must support archive");
  assert.match(leadership, /decide_nomination/, "Programs admin must support nomination decisions");
  assert.match(leadership, /save_development_record/, "Development admin must support record updates");
  assert.match(leadership, /save_department/, "Departments admin must support profile saves");
  assert.ok(!leadership.includes('window.prompt("Reason for this permission change'), "Permissions must not use window.prompt");

  assert.match(pack, /publish_fun_question/, "Fun Zone activity table must publish questions");
  assert.match(pack, /FunZoneActivityTable/, "Fun Zone admin must list draft items");

  assert.match(panel, /ro-te-main--premium/, "Manage views use premium main layout");
  assert.match(panel, /ProgramsAdminBody data=\{record\} onAction=\{onAction\}/, "Programs view receives actions");

  console.log("team-engagement-manage-chrome: ok");
}

main();