type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import {
  canUseFitdogEmployeeApi,
  pullFitdogRouteReportFromApi
} from "@/lib/route-generator/fitdog-api";

function pacificDateOffset(daysFromToday: number): string {
  const now = new Date();
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  pacific.setDate(pacific.getDate() + daysFromToday);
  const y = pacific.getFullYear();
  const m = String(pacific.getMonth() + 1).padStart(2, "0");
  const d = String(pacific.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function phoneFromMasked(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text || /[•*]/.test(text)) return null;
  return text;
}

/**
 * Daily (or on-demand) pull from app.fitdog.com class occurrences into
 * fitdog_customers / fitdog_dogs so VIP Auto Book search can autocomplete.
 */
export async function syncVipFitdogDirectory(
  supabase: SupabaseClient,
  options?: { lookbackDays?: number; lookaheadDays?: number }
): Promise<{
  ok: boolean;
  ownersUpserted: number;
  dogsUpserted: number;
  datesScanned: string[];
  message: string;
  error?: string;
}> {
  if (!canUseFitdogEmployeeApi()) {
    return {
      ok: false,
      ownersUpserted: 0,
      dogsUpserted: 0,
      datesScanned: [],
      message: "Fitdog employee API credentials are not configured.",
      error: "Missing FITDOG_EMPLOYEE_EMAIL / FITDOG_EMPLOYEE_PASSWORD."
    };
  }

  const lookback = Math.max(0, Math.min(14, options?.lookbackDays ?? 3));
  const lookahead = Math.max(0, Math.min(14, options?.lookaheadDays ?? 7));
  const dates: string[] = [];
  for (let i = -lookback; i <= lookahead; i += 1) {
    dates.push(pacificDateOffset(i));
  }

  const { data: run, error: runError } = await supabase
    .from("vip_auto_book_directory_sync")
    .insert({
      status: "running",
      dates_scanned: dates
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  const owners = new Map<
    string,
    { owner_name: string; email: string | null; phone: string | null; raw: Record<string, unknown> }
  >();
  const dogs = new Map<
    string,
    {
      fitdog_owner_id: string | null;
      dog_name: string;
      breed: string | null;
      raw: Record<string, unknown>;
    }
  >();

  const warnings: string[] = [];
  try {
    for (const date of dates) {
      try {
        const bundle = await pullFitdogRouteReportFromApi(date);
        for (const item of [...bundle.pickupItems, ...bundle.dropoffItems]) {
          const ownerId = item.customerId?.trim();
          const dogId = item.dogId?.trim();
          const ownerName = item.ownerFullName?.trim() || "";
          const dogName = item.dogName?.trim() || "";
          if (ownerId && ownerName) {
            owners.set(ownerId, {
              owner_name: ownerName,
              email: null,
              phone: phoneFromMasked(item.ownerPhoneMasked),
              raw: {
                source: "class_occurrence",
                date,
                service: item.serviceRaw
              }
            });
          }
          if (dogId && dogName) {
            dogs.set(dogId, {
              fitdog_owner_id: ownerId || null,
              dog_name: dogName,
              breed: null,
              raw: {
                source: "class_occurrence",
                date,
                service: item.serviceRaw,
                dog_size: item.dogSize
              }
            });
          }
        }
        if (bundle.warnings.length) warnings.push(...bundle.warnings.slice(0, 5));
      } catch (error) {
        warnings.push(
          `${date}: ${error instanceof Error ? error.message : "Fitdog pull failed"}`
        );
      }
    }

    let ownersUpserted = 0;
    let dogsUpserted = 0;

    for (const [fitdogOwnerId, row] of owners) {
      const { error } = await supabase.from("fitdog_customers").upsert(
        {
          fitdog_owner_id: fitdogOwnerId,
          owner_name: row.owner_name,
          email: row.email,
          phone: row.phone,
          source_url: "https://app.fitdog.com/",
          raw: row.raw
        },
        { onConflict: "fitdog_owner_id" }
      );
      if (!error) ownersUpserted += 1;
    }

    for (const [fitdogDogId, row] of dogs) {
      const { error } = await supabase.from("fitdog_dogs").upsert(
        {
          fitdog_dog_id: fitdogDogId,
          fitdog_owner_id: row.fitdog_owner_id,
          dog_name: row.dog_name,
          breed: row.breed,
          source_url: "https://app.fitdog.com/",
          raw: row.raw
        },
        { onConflict: "fitdog_dog_id" }
      );
      if (!error) dogsUpserted += 1;
    }

    const message = `Scanned ${dates.length} day(s) from app.fitdog.com · ${ownersUpserted} owners · ${dogsUpserted} dogs${
      warnings.length ? ` · ${warnings.length} warning(s)` : ""
    }`;

    await supabase
      .from("vip_auto_book_directory_sync")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        owners_upserted: ownersUpserted,
        dogs_upserted: dogsUpserted,
        message,
        error: warnings.length ? warnings.slice(0, 8).join(" | ") : null
      })
      .eq("id", run.id);

    return { ok: true, ownersUpserted, dogsUpserted, datesScanned: dates, message };
  } catch (error) {
    const err = error instanceof Error ? error.message : "Directory sync failed.";
    await supabase
      .from("vip_auto_book_directory_sync")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: err,
        message: "VIP Fitdog directory sync failed."
      })
      .eq("id", run.id);
    return {
      ok: false,
      ownersUpserted: 0,
      dogsUpserted: 0,
      datesScanned: dates,
      message: "VIP Fitdog directory sync failed.",
      error: err
    };
  }
}

export async function getLatestVipDirectorySync(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("vip_auto_book_directory_sync")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
