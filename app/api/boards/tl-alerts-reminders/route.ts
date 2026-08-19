import { after, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getOrLoadTtlCache, getTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { getTlDigiBoardSnapshot, loadTlDigiBoardPublicPayload } from "@/lib/tl-digi-board/server";
import { buildUnavailableTlBoardSnapshot, rehydrateTlBoardSnapshot } from "@/lib/tl-digi-board/board-state";
import {
  TL_BOARD_PUBLIC_BACKGROUND_SYNC_COOLDOWN_MS,
  TL_BOARD_PUBLIC_CACHE_TTL_MS,
  TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS
} from "@/lib/tl-digi-board/constants";
import { logTlGingrSyncEvent } from "@/lib/tl-digi-board/observability";
import type { TlDigiBoardPublicPayload } from "@/lib/tl-digi-board/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TL_BOARD_PUBLIC_CACHE_KEY = "tl-board:public-payload";
const TL_BOARD_LAST_GOOD_KEY = "tl-board:public-last-good";
const TL_BOARD_LAST_GOOD_TTL_MS = 120_000;

let lastPublicBackgroundSyncAt = 0;

function snapshotHasUsableData(payload: TlDigiBoardPublicPayload) {
  return Boolean(
    payload.meta.lastSuccessfulSyncAt ||
    payload.medications.length ||
    payload.overdue.length ||
    payload.current.length
  );
}

function payloadFromLastGood(lastGood: TlDigiBoardPublicPayload): TlDigiBoardPublicPayload {
  const rehydrated = rehydrateTlBoardSnapshot(
    {
      overdue: lastGood.overdue,
      current: lastGood.current,
      summary: lastGood.summary,
      additionalServices: lastGood.additionalServices,
      servicesSummary: lastGood.servicesSummary,
      meta: lastGood.meta,
      medications: lastGood.medications,
      generatedAt: lastGood.generatedAt
    },
    new Date()
  );
  return {
    ...rehydrated,
    config: lastGood.config,
    reminders: lastGood.reminders
  };
}

function rememberLastGood(payload: TlDigiBoardPublicPayload) {
  if (snapshotHasUsableData(payload)) {
    setTtlCache(TL_BOARD_LAST_GOOD_KEY, payload, TL_BOARD_LAST_GOOD_TTL_MS);
  }
}

function resolvePayload(payload: TlDigiBoardPublicPayload) {
  if (snapshotHasUsableData(payload)) {
    rememberLastGood(payload);
    return payload;
  }
  const lastGood = getTtlCache<TlDigiBoardPublicPayload>(TL_BOARD_LAST_GOOD_KEY);
  if (lastGood && snapshotHasUsableData(lastGood)) {
    return payloadFromLastGood(lastGood);
  }
  return payload;
}

/**
 * Public READ for the Team Lead Alerts + Reminders TV display.
 * No admin session required (same pattern as live-board / cast-tv).
 * Never exposes GINGR_API_KEY or other secrets.
 *
 * This GET must not wait on Gingr. Production hung here because Supabase reads
 * had no fetch abort — Vercel waits on the underlying fetch before sending bytes.
 * Serve the stored snapshot immediately; refresh Gingr in `after()` (and the 1-minute cron).
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("force") === "1";
    const supabase = getServiceSupabase({ timeoutMs: TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS });

    const loadPayload = () => loadTlDigiBoardPublicPayload(supabase, { forceRefresh });

    const loaded = forceRefresh
      ? await loadPayload()
      : await getOrLoadTtlCache(TL_BOARD_PUBLIC_CACHE_KEY, TL_BOARD_PUBLIC_CACHE_TTL_MS, loadPayload);

    const payload = resolvePayload(loaded.payload);
    const needsBackgroundSync = loaded.needsBackgroundSync;

    if (needsBackgroundSync) {
      const now = Date.now();
      if (now - lastPublicBackgroundSyncAt >= TL_BOARD_PUBLIC_BACKGROUND_SYNC_COOLDOWN_MS) {
        lastPublicBackgroundSyncAt = now;
        after(() => {
          void getTlDigiBoardSnapshot(supabase, { forceRefresh: true }).catch((error) => {
            const message = error instanceof Error ? error.message : "TL Digi Board background sync failed.";
            logTlGingrSyncEvent("GINGR_SYNC_FAILURE", { error: message, source: "public_api_after" });
          });
        });
      }
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "X-Tl-Board-Load-Ms": String(Date.now() - startedAt)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TL Digi Board snapshot.";
    logTlGingrSyncEvent("GINGR_SYNC_FAILURE", { error: message, source: "public_api" });
    const lastGood = getTtlCache<TlDigiBoardPublicPayload>(TL_BOARD_LAST_GOOD_KEY);
    if (lastGood && snapshotHasUsableData(lastGood)) {
      return NextResponse.json(payloadFromLastGood(lastGood), {
        headers: {
          "Cache-Control": "no-store",
          "X-Tl-Board-Load-Ms": String(Date.now() - startedAt),
          "X-Tl-Board-Stale": "1"
        }
      });
    }
    const unavailable = buildUnavailableTlBoardSnapshot(new Date(), message);
    return NextResponse.json(
      {
        ...unavailable,
        config: { displayTitle: "Team Lead Alerts + Reminders", enabled: true },
        reminders: [],
        error: message
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Tl-Board-Load-Ms": String(Date.now() - startedAt)
        }
      }
    );
  }
}
