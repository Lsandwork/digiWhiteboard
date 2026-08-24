/**
 * RuffOps cloud object storage probe.
 *
 * Storage is Supabase Storage (not Vercel Blob / S3). Production media lives in
 * known buckets used by photo uploads, cast TV, cast videos, and lobby slideshow.
 * We probe listBuckets + list(limit:1) per bucket and optional recent media rows
 * so health reflects real accessibility — not a unused MEDIA_LIBRARY_BUCKET env.
 */

import { PHOTO_UPLOAD_BUCKET } from "@/lib/photo-upload-queue/types";
import { CAST_VIDEO_BUCKET } from "@/lib/staff/cast-video-notices";
import { CAST_TV_BUCKET } from "@/lib/cast-tv/media";
import { LOBBY_SLIDESHOW_BUCKET } from "@/lib/lobby/slideshow-uploads";
import type { HealthStatus } from "@/lib/system-health/types";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export type StorageBucketProbe = {
  bucket: string;
  purpose: string;
  critical: boolean;
  present: boolean;
  listOk: boolean;
  objectSampleCount: number | null;
  latencyMs: number | null;
  error: string | null;
};

export type StorageProbeResult = {
  status: HealthStatus;
  detail: string;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  buckets: StorageBucketProbe[];
  recentMediaAt: string | null;
};

const EXPECTED_BUCKETS: Array<{ bucket: string; purpose: string; critical: boolean }> = [
  {
    bucket: PHOTO_UPLOAD_BUCKET,
    purpose: "Photo upload queue + media library binaries",
    critical: true
  },
  {
    bucket: CAST_VIDEO_BUCKET,
    purpose: "Staff cast video notices",
    critical: true
  },
  {
    bucket: CAST_TV_BUCKET,
    purpose: "Cast TV playlist images/videos",
    critical: true
  },
  {
    bucket: LOBBY_SLIDESHOW_BUCKET,
    purpose: "Lobby idle slideshow uploads",
    critical: false
  }
];

export function supabaseProjectUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || url === "PASTE_SUPABASE_PROJECT_URL_HERE" || !/^https?:\/\//.test(url)) {
    return null;
  }
  return url;
}

export async function probeCloudStorage(supabase: Supabase): Promise<StorageProbeResult> {
  const started = Date.now();
  const projectUrl = supabaseProjectUrl();
  if (!projectUrl) {
    return {
      status: "FAILED",
      detail: "NEXT_PUBLIC_SUPABASE_URL is not configured — cloud storage unreachable.",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: "missing_supabase_url",
      buckets: [],
      recentMediaAt: null
    };
  }

  let listedNames = new Set<string>();
  let listBucketsError: string | null = null;
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) listBucketsError = error.message;
    listedNames = new Set((data ?? []).map((b) => b.name));
  } catch (err) {
    listBucketsError = err instanceof Error ? err.message : String(err);
  }

  const buckets: StorageBucketProbe[] = [];
  for (const expected of EXPECTED_BUCKETS) {
    const bucketStarted = Date.now();
    const present = listedNames.size === 0 && listBucketsError
      ? true // listBuckets failed — still try per-bucket list (some projects restrict listBuckets)
      : listedNames.has(expected.bucket) || listedNames.size === 0;

    let listOk = false;
    let objectSampleCount: number | null = null;
    let error: string | null = null;

    try {
      const { data, error: listError } = await supabase.storage
        .from(expected.bucket)
        .list("", { limit: 5, offset: 0 });
      if (listError) {
        error = listError.message;
        // "not found" / Bucket not found → missing
        if (/not found|does not exist/i.test(listError.message)) {
          buckets.push({
            bucket: expected.bucket,
            purpose: expected.purpose,
            critical: expected.critical,
            present: false,
            listOk: false,
            objectSampleCount: null,
            latencyMs: Date.now() - bucketStarted,
            error
          });
          continue;
        }
      } else {
        listOk = true;
        objectSampleCount = (data ?? []).length;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    buckets.push({
      bucket: expected.bucket,
      purpose: expected.purpose,
      critical: expected.critical,
      present: listOk ? true : present && !error,
      listOk,
      objectSampleCount,
      latencyMs: Date.now() - bucketStarted,
      error
    });
  }

  // Functional evidence: recent CAST-TV objects in storage (Postgres media tables hang).
  let recentMediaAt: string | null = null;
  try {
    const { data } = await supabase.storage.from(CAST_TV_BUCKET).list("cast-tv", {
      limit: 5,
      sortBy: { column: "updated_at", order: "desc" }
    });
    const stamp = data?.find((row) => row.updated_at || row.created_at);
    recentMediaAt = stamp?.updated_at || stamp?.created_at || null;
  } catch {
    /* optional */
  }

  const critical = buckets.filter((b) => b.critical);
  const criticalOk = critical.filter((b) => b.listOk);
  const criticalMissing = critical.filter((b) => !b.listOk);
  const optionalFail = buckets.filter((b) => !b.critical && !b.listOk);
  const totalMs = Date.now() - started;
  const avgLatency =
    buckets.filter((b) => b.latencyMs != null).length > 0
      ? Math.round(
          buckets.reduce((n, b) => n + Number(b.latencyMs || 0), 0) /
            buckets.filter((b) => b.latencyMs != null).length
        )
      : totalMs;

  let status: HealthStatus = "HEALTHY";
  let detail = "";
  let lastError: string | null = null;
  let lastFailureAt: string | null = null;

  if (criticalOk.length === 0 && criticalMissing.length > 0) {
    status = "FAILED";
    detail = `Critical storage buckets unreachable: ${criticalMissing.map((b) => b.bucket).join(", ")}.`;
    lastError = criticalMissing.map((b) => b.error || b.bucket).join("; ");
    lastFailureAt = new Date().toISOString();
  } else if (criticalMissing.length > 0) {
    status = "DEGRADED";
    detail = `Some critical buckets failed: ${criticalMissing.map((b) => b.bucket).join(", ")}. ${criticalOk.length}/${critical.length} critical OK.`;
    lastError = criticalMissing.map((b) => `${b.bucket}: ${b.error || "list failed"}`).join("; ");
    lastFailureAt = new Date().toISOString();
  } else if (optionalFail.length > 0) {
    status = "WARNING";
    detail = `Critical buckets OK (${criticalOk.map((b) => b.bucket).join(", ")}); optional missing: ${optionalFail.map((b) => b.bucket).join(", ")}.`;
  } else if (listBucketsError && criticalOk.length === critical.length) {
    status = "HEALTHY";
    detail = `All ${critical.length} critical buckets list OK (${avgLatency} ms avg). listBuckets limited: ${listBucketsError}`;
  } else {
    status = "HEALTHY";
    detail = `Cloud storage OK — ${buckets.filter((b) => b.listOk).length}/${buckets.length} buckets accessible (${avgLatency} ms avg).`;
  }

  return {
    status,
    detail,
    responseTimeMs: avgLatency,
    lastSuccessAt: criticalOk.length ? new Date().toISOString() : recentMediaAt,
    lastFailureAt,
    lastError,
    buckets,
    recentMediaAt
  };
}
