/**
 * One-command Automatic Blog activation after credentials are available.
 *
 * Requires either:
 *   - SUPABASE_DB_PASSWORD / DATABASE_URL for migrations, and
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for seeding
 *
 * Usage:
 *   npx tsx scripts/activate-automatic-blog.ts
 */
import { spawnSync } from "node:child_process";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

function run(command: string, args: string[]) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

async function main() {
  const hasDb =
    Boolean(process.env.SUPABASE_DB_PASSWORD?.trim()) ||
    Boolean(process.env.DATABASE_URL?.trim()) ||
    Boolean(process.env.SUPABASE_DB_URL?.trim());
  const hasService =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (!hasDb && !hasService) {
    throw new Error(
      "Missing credentials. Add SUPABASE_DB_PASSWORD (or DATABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to .env.local, then re-run."
    );
  }

  if (hasDb) {
    console.log("Applying migrations 054 and 055...");
    run("npm", ["run", "db:push", "--", "054_automatic_blog.sql"]);
    run("npm", ["run", "db:push", "--", "055_automatic_blog_public.sql"]);
  } else {
    console.warn("Skipping SQL migrations — no DB password/URL. Apply 054/055 in Supabase SQL editor, then re-run.");
  }

  if (!hasService) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for seeding.");
  }

  const { seedBlogTopics, getBlogSettings } = await import("../lib/blog/service");
  const { seedInitialPublishedArticles } = await import("../lib/blog/content/seed-published");
  const { getServiceSupabase } = await import("../lib/supabase/server");

  const topics = await seedBlogTopics("activate-script");
  console.log(`Topics seeded: inserted=${topics.inserted} skipped=${topics.skipped}`);

  const published = await seedInitialPublishedArticles("activate-script");
  console.log(`Published articles upserted: ${published.upserted}`);

  const supabase = getServiceSupabase();
  await supabase
    .from("blog_settings")
    .update({
      enabled: true,
      setup_completed: true,
      setup_step: 18,
      auto_publish_enabled: false,
      ai_images_enabled: false,
      emergency_off: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", "default");

  const settings = await getBlogSettings();
  console.log("\nAutomatic Blog activated.");
  console.log({
    enabled: settings.enabled,
    auto_publish_enabled: settings.auto_publish_enabled,
    ai_images_enabled: settings.ai_images_enabled,
    published_count: settings.published_count,
    human_score_threshold: settings.human_score_threshold
  });
  console.log("\nNext:");
  console.log("1. Open /blog");
  console.log("2. Open /admin/automatic-blog");
  console.log("3. Keep auto-publish OFF until you intentionally enable it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
