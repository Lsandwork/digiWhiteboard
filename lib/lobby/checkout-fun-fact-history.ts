import { CHECKOUT_FUN_FACT_HISTORY_DAYS } from "@/lib/lobby/checkout-fun-fact-catalog";
import { checkoutFunFactDogKey } from "@/lib/lobby/checkout-fun-fact-select";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

export async function loadCheckoutFunFactHistory(
  supabase: SupabaseClient,
  input: { dogName: string; animalId?: string | null; now?: Date }
) {
  const dogKey = checkoutFunFactDogKey(input);
  const since = new Date(
    (input.now ?? new Date()).getTime() - CHECKOUT_FUN_FACT_HISTORY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("checkout_fun_fact_history")
    .select("joke_id, shown_at")
    .eq("dog_key", dogKey)
    .gte("shown_at", since)
    .order("shown_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  return (data ?? []).map((row) => ({
    jokeId: String((row as { joke_id: string }).joke_id),
    shownAt: String((row as { shown_at: string }).shown_at)
  }));
}

export async function recordCheckoutFunFactHistory(
  supabase: SupabaseClient,
  input: { dogName: string; animalId?: string | null; jokeIds: string[]; now?: Date }
) {
  if (!input.jokeIds.length) return;
  const dogKey = checkoutFunFactDogKey(input);
  const shownAt = (input.now ?? new Date()).toISOString();
  const rows = input.jokeIds.map((jokeId) => ({
    dog_key: dogKey,
    joke_id: jokeId,
    shown_at: shownAt,
    created_at: shownAt
  }));

  const { error } = await supabase.from("checkout_fun_fact_history").upsert(rows, {
    onConflict: "dog_key,joke_id"
  });
  if (error && !isMissingRelation(error)) throw error;
}
