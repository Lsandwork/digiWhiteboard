/**
 * Programmatic RuffOps surface inventory. Run:
 *   npx tsx scripts/inventory-platform.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

function walk(dir: string, match: (name: string) => boolean, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, match, acc);
    else if (match(entry)) acc.push(full);
  }
  return acc;
}

function toRoute(file: string, kind: "page" | "api") {
  const rel = relative(join(ROOT, "app"), file).replace(/\\/g, "/");
  if (kind === "page") {
    const path = rel.replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, "").replace(/\/page\.ts$/, "");
    return path ? `/${path}` : "/";
  }
  return `/api/${rel.replace(/^api\//, "").replace(/\/route\.ts$/, "").replace(/\/route\.js$/, "")}`;
}

const pages = walk(join(ROOT, "app"), (n) => n === "page.tsx").map((f) => toRoute(f, "page"));
const apis = walk(join(ROOT, "app"), (n) => n === "route.ts")
  .filter((f) => f.includes("/api/"))
  .map((f) => toRoute(f, "api"));
const crons = apis.filter((r) => r.startsWith("/api/cron/"));
const errorFiles = walk(join(ROOT, "app"), (n) => n === "error.tsx" || n === "global-error.tsx" || n === "loading.tsx" || n === "not-found.tsx");
const intervals = walk(ROOT, (n) => n.endsWith(".ts") || n.endsWith(".tsx"))
  .filter((f) => !f.includes("node_modules") && !f.includes(".next"))
  .flatMap((f) => {
    const text = readFileSync(f, "utf8");
    const hits: string[] = [];
    if (text.includes("setInterval(")) hits.push(`${relative(ROOT, f)}:setInterval`);
    if (text.includes("startVisibilityAwareInterval(")) hits.push(`${relative(ROOT, f)}:visibilityInterval`);
    if (text.includes(".channel(") && text.includes("postgres_changes")) hits.push(`${relative(ROOT, f)}:realtime`);
    return hits;
  });

const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
  crons?: Array<{ path: string; schedule: string }>;
};

console.log(
  JSON.stringify(
    {
      pages: pages.sort(),
      pageCount: pages.length,
      apis: apis.sort(),
      apiCount: apis.length,
      cronRoutes: crons.sort(),
      vercelCrons: vercel.crons ?? [],
      errorLoadingNotFound: errorFiles.map((f) => relative(ROOT, f)).sort(),
      liveUpdateHits: intervals.sort(),
      hosts: [
        "fitdog.ruffops.com",
        "staff.ruffops.com",
        "lobby.ruffops.com",
        "casttv.ruffops.com",
        "ruffly.ruffops.com",
        "blog.ruffops.com"
      ]
    },
    null,
    2
  )
);
