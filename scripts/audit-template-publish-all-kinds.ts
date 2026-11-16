/**
 * Dry-run publishEngagementTemplate for one catalog item per kind.
 * npx tsx scripts/audit-template-publish-all-kinds.ts
 */
import { ENGAGEMENT_TEMPLATE_CATALOG } from "@/lib/team-engagement/template-catalog.generated";
import { publishEngagementTemplate } from "@/lib/team-engagement/template-library";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

const failures: string[] = [];

async function main() {
  const db = seededDb();
  const actors = [PEOPLE.superAdmin, PEOPLE.groomingManager] as const;
  for (const person of actors) {
    const manager = serviceContextFor(db, actorFor(person));
    const seenKind = new Set<string>();
    for (const item of ENGAGEMENT_TEMPLATE_CATALOG) {
      if (seenKind.has(item.kind)) continue;
      seenKind.add(item.kind);
      try {
        await publishEngagementTemplate(manager, {
          templateId: `catalog-${item.slug}`,
          title: item.titleTemplate.replace(/\[.*?\]/g, "Team"),
          message: item.messageTemplate.replace(/\[.*?\]/g, "Team"),
          publishMode: "live"
        });
        console.log("ok", person.primaryRole, item.kind, item.slug);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        failures.push(`${person.primaryRole} ${item.kind} (${item.slug}): ${msg}`);
        console.error("fail", person.primaryRole, item.kind, msg);
      }
    }
  }
  if (failures.length) {
    console.error("\nFailures:", failures.length);
    for (const line of failures) console.error(line);
    process.exit(1);
  }
  console.log("audit-template-publish-all-kinds: ok");
}

void main();