"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Upload } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import "./package-eligibility-panel.css";

type Summary = {
  totalCsvRows: number;
  eligiblePackageRows: number;
  monthlyUnlimited: number;
  twentyDayPlus: number;
  matchedAutomatically: number;
  matchedBySavedMapping: number;
  ambiguous: number;
  unresolved: number;
  expired: number;
  zeroRemaining: number;
  lastSync: string;
};

type ReviewRow = {
  id: string;
  ownerDisplayName: string;
  normalizedOwnerName: string;
  packageType: string;
  packageKey: string;
  numberRemaining: number | null;
  matchStatus: "ambiguous" | "unresolved";
  candidates: Array<{ gingrOwnerId: string; firstName: string; lastName: string }>;
};

function formatPacific(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  }).format(date);
}

export function PackageEligibilityPanel() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [freshness, setFreshness] = useState<"FRESH" | "STALE" | "MISSING">("MISSING");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [schemaMessage, setSchemaMessage] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<
    Record<string, Array<{ gingrOwnerId: string; firstName: string; lastName: string }>>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/admin/package-eligibility", { cache: "no-store" });
    const body = (await response.json()) as {
      freshness?: "FRESH" | "STALE" | "MISSING";
      lastSync?: string | null;
      summary?: Summary | null;
      schema?: { status: string; message: string };
      schemaMissing?: boolean;
      error?: string;
    };
    if (!response.ok) {
      setSchemaMessage(body.error ?? "Unable to load package eligibility.");
      return;
    }
    setFreshness(body.freshness ?? "MISSING");
    setLastSync(body.lastSync ?? null);
    setSummary(body.summary ?? null);
    if (body.schema?.status === "not_applied") setSchemaMessage(body.schema.message);
    else setSchemaMessage(null);
  }, []);

  const loadReview = useCallback(async () => {
    const response = await fetch("/api/admin/package-eligibility/review", { cache: "no-store" });
    const body = (await response.json()) as { rows?: ReviewRow[]; error?: string };
    if (!response.ok) return;
    setReview(body.rows ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await loadStatus();
          await loadReview();
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReview, loadStatus]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/package-eligibility", { method: "POST", body: form });
      const body = (await response.json()) as { ok?: boolean; error?: string; summary?: Summary };
      if (!response.ok) throw new Error(body.error ?? "Import failed.");
      setSummary(body.summary ?? null);
      showToast("Package Sync Complete", "success");
      await loadStatus();
      await loadReview();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Import failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function searchOwners(rowId: string, query: string) {
    setSearch((current) => ({ ...current, [rowId]: query }));
    if (query.trim().length < 2) {
      setSearchResults((current) => ({ ...current, [rowId]: [] }));
      return;
    }
    const response = await fetch(`/api/admin/package-eligibility/owners?q=${encodeURIComponent(query)}`, {
      cache: "no-store"
    });
    const body = (await response.json()) as {
      candidates?: Array<{ gingrOwnerId: string; firstName: string; lastName: string }>;
    };
    if (response.ok) setSearchResults((current) => ({ ...current, [rowId]: body.candidates ?? [] }));
  }

  async function selectOwner(row: ReviewRow, gingrOwnerId: string) {
    setSavingId(row.id);
    try {
      const response = await fetch("/api/admin/package-eligibility/map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          normalizedOwnerName: row.normalizedOwnerName,
          ownerDisplayName: row.ownerDisplayName,
          gingrOwnerId
        })
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to save mapping.");
      showToast("Owner mapping saved. Eligibility recomputed.", "success");
      await loadStatus();
      await loadReview();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save mapping.", "error");
    } finally {
      setSavingId(null);
    }
  }

  const needsReview = (summary?.ambiguous ?? 0) + (summary?.unresolved ?? 0);

  return (
    <section className="pgw-elig admin-card">
      <header className="pgw-elig__header">
        <div>
          <p className="pgw-elig__eyebrow">Admin / Gingr</p>
          <h1 className="admin-text-emphasis">Package Eligibility</h1>
          <p className="pgw-elig__sub">
            Upload Gingr&apos;s Outstanding Packages Report. Only Monthly Unlimited and 20-Day PLUS Package qualify.
          </p>
        </div>
        <div className={`pgw-elig__sync pgw-elig__sync--${freshness.toLowerCase()}`}>
          Last package sync: {formatPacific(lastSync)}
          <span>{freshness}</span>
        </div>
      </header>

      {schemaMessage ? (
        <div className="pgw-elig__banner" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {schemaMessage}
        </div>
      ) : null}

      <label className="pgw-elig__upload">
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span>{uploading ? "Importing…" : "Upload Outstanding Packages Report"}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onUpload(file);
          }}
        />
      </label>

      {loading ? (
        <p className="pgw-elig__muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : null}

      {summary ? (
        <div className="pgw-elig__summary">
          <h2>Package Sync Complete</h2>
          <dl>
            <div><dt>Total CSV rows</dt><dd>{summary.totalCsvRows}</dd></div>
            <div><dt>Eligible package rows</dt><dd>{summary.eligiblePackageRows}</dd></div>
            <div><dt>Monthly Unlimited</dt><dd>{summary.monthlyUnlimited}</dd></div>
            <div><dt>20-Day PLUS</dt><dd>{summary.twentyDayPlus}</dd></div>
            <div><dt>Matched automatically</dt><dd>{summary.matchedAutomatically}</dd></div>
            <div><dt>Matched by saved mapping</dt><dd>{summary.matchedBySavedMapping}</dd></div>
            <div><dt>Ambiguous</dt><dd>{summary.ambiguous}</dd></div>
            <div><dt>Unresolved</dt><dd>{summary.unresolved}</dd></div>
            <div><dt>Expired</dt><dd>{summary.expired}</dd></div>
            <div><dt>Zero remaining</dt><dd>{summary.zeroRemaining}</dd></div>
            <div><dt>Last sync</dt><dd>{formatPacific(summary.lastSync)}</dd></div>
          </dl>
        </div>
      ) : (
        <p className="pgw-elig__muted">No successful package report has been synced yet.</p>
      )}

      {needsReview > 0 ? (
        <section className="pgw-elig__review">
          <h2>Review Package Owners</h2>
          <p>Successfully matched owners stay eligible. Do not auto-choose a duplicate name.</p>
          <ul>
            {review.map((row) => (
              <li key={row.id} className="pgw-elig__row">
                <div>
                  <strong>{row.ownerDisplayName}</strong>
                  <span>
                    {row.packageType} · {row.matchStatus}
                    {row.numberRemaining != null ? ` · ${row.numberRemaining} remaining` : ""}
                  </span>
                </div>
                {row.candidates.length ? (
                  <div className="pgw-elig__choices">
                    {row.candidates.map((candidate) => (
                      <button
                        key={candidate.gingrOwnerId}
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void selectOwner(row, candidate.gingrOwnerId)}
                      >
                        Select {candidate.firstName} {candidate.lastName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pgw-elig__search">
                    <Search className="h-4 w-4" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Search Gingr owners…"
                      value={search[row.id] ?? ""}
                      onChange={(event) => void searchOwners(row.id, event.target.value)}
                    />
                    {(searchResults[row.id] ?? []).map((candidate) => (
                      <button
                        key={candidate.gingrOwnerId}
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void selectOwner(row, candidate.gingrOwnerId)}
                      >
                        {candidate.firstName} {candidate.lastName}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : summary ? (
        <p className="pgw-elig__ok">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> No package owners need review.
        </p>
      ) : null}
    </section>
  );
}
