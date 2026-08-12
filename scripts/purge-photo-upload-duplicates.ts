/**
 * One-shot: delete duplicate photo_upload_items (keep oldest per SHA-256) and storage files.
 *
 *   npx tsx scripts/purge-photo-upload-duplicates.ts
 */
import { loadEnvFiles } from "./load-env-local";
import { getServiceSupabase } from "@/lib/supabase/server";
import { purgeDuplicatePhotoItems } from "@/lib/photo-upload-queue/service";

loadEnvFiles();

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  const supabase = getServiceSupabase();
  const result = await purgeDuplicatePhotoItems(supabase, {
    name: "duplicate-purge-script",
    email: null
  });
  console.log(
    `Purged ${result.deleted} duplicate item(s). Kept ${result.kept} unique hash(es) across ${result.hashes} hash group(s).`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
