import { NextResponse } from "next/server";
import { canReadLobbyBoard, unauthorizedLobbyResponse } from "@/lib/lobby/auth";
import { loadCheckoutFunFactHistory, recordCheckoutFunFactHistory } from "@/lib/lobby/checkout-fun-fact-history";
import { selectCheckoutFunFacts } from "@/lib/lobby/checkout-fun-fact-select";
import { getClassicCheckoutFunFactTemplates } from "@/lib/lobby/checkout-spotlight-fun-facts";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function parseCount(value: string | null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(6, Math.max(4, Math.round(n)));
}

export async function GET(request: Request) {
  if (!canReadLobbyBoard(request)) return unauthorizedLobbyResponse();

  const url = new URL(request.url);
  const dogName = String(url.searchParams.get("dogName") ?? "").trim();
  if (!dogName) {
    return NextResponse.json({ error: "dogName is required." }, { status: 400 });
  }

  const animalId = url.searchParams.get("animalId");
  const breed = url.searchParams.get("breed");
  const count = parseCount(url.searchParams.get("count"));
  const classicTemplates = getClassicCheckoutFunFactTemplates();
  const fallback = selectCheckoutFunFacts({
    dogName,
    animalId,
    breed,
    count,
    classicTemplates,
    recent: []
  });

  try {
    const supabase = getServiceSupabase({ timeoutMs: 1_500 });
    const recent = await loadCheckoutFunFactHistory(supabase, { dogName, animalId });
    const selected = selectCheckoutFunFacts({
      dogName,
      animalId,
      breed,
      count,
      classicTemplates,
      recent
    });
    void recordCheckoutFunFactHistory(supabase, {
      dogName,
      animalId,
      jokeIds: selected.selected.map((item) => item.id)
    }).catch((error) => {
      console.warn(
        "[lobby-checkout-fun-facts] history write failed:",
        error instanceof Error ? error.message : error
      );
    });
    return NextResponse.json({
      facts: selected.texts,
      joke_ids: selected.selected.map((item) => item.id)
    });
  } catch (error) {
    console.warn(
      "[lobby-checkout-fun-facts] history lookup failed; using deterministic fallback:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({
      facts: fallback.texts,
      joke_ids: fallback.selected.map((item) => item.id),
      fallback: true
    });
  }
}
