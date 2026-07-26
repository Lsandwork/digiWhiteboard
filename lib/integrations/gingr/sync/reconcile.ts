import { createGingrClient } from "@/lib/integrations/gingr/client";
import { mapGingrOwnerToContact } from "@/lib/integrations/gingr/mappers/contact";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function runGingrContactReconciliation(options?: { modifiedSince?: string; limit?: number }) {
  const supabase = getServiceSupabase();
  const { data: run, error: runError } = await supabase
    .from("ruffly_sync_runs")
    .insert({ trigger: "reconcile", status: "running" })
    .select("*")
    .single();
  if (runError) throw runError;

  let contactsUpserted = 0;
  let errors = 0;
  let message = "ok";

  try {
    const client = createGingrClient();
    const owners = await client.listOwners({
      modified_since: options?.modifiedSince,
      limit: options?.limit ?? 100
    });
    const list = Array.isArray(owners) ? owners : [];
    for (const owner of list) {
      try {
        const mapped = mapGingrOwnerToContact(owner);
        const { error } = await supabase.from("ruffly_contacts").upsert(
          {
            ...mapped,
            client_status: "active",
            updated_at: new Date().toISOString()
          },
          { onConflict: "gingr_owner_id" }
        );
        // Unique partial index may not map to onConflict — fallback update/insert
        if (error) {
          const existing = await supabase
            .from("ruffly_contacts")
            .select("id")
            .eq("gingr_owner_id", mapped.gingr_owner_id)
            .maybeSingle();
          if (existing.data?.id) {
            await supabase.from("ruffly_contacts").update(mapped).eq("id", existing.data.id);
          } else {
            await supabase.from("ruffly_contacts").insert(mapped);
          }
        }
        contactsUpserted += 1;
      } catch {
        errors += 1;
      }
    }
  } catch (error) {
    errors += 1;
    message = error instanceof Error ? error.message : "Reconciliation failed.";
    await supabase
      .from("ruffly_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        contacts_upserted: contactsUpserted,
        errors,
        message
      })
      .eq("id", run.id);
    return { ok: false, runId: run.id, contactsUpserted, errors, message };
  }

  await supabase
    .from("ruffly_sync_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      contacts_upserted: contactsUpserted,
      errors,
      message
    })
    .eq("id", run.id);

  return { ok: true, runId: run.id, contactsUpserted, errors, message };
}
