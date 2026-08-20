"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";

type Dashboard = {
  date: string;
  sends: number;
  estimatedSegments: number;
  actualSegments: number | null;
  estimatedSpend: number;
  actualSpend: number | null;
  multiSegmentPct: number;
  byCategory: Record<string, { sends: number; estimatedSegments: number; actualSegments: number | null }>;
  segmentBuckets: { one: number; two: number; three: number; fourPlus: number };
  topTemplates: Array<{ templateKey: string; totalSegments: number; sends: number }>;
};

type Thresholds = {
  dailySegmentWarning: number;
  dailySegmentCritical: number;
  dailyDollarWarning: number;
};

type SmartEncoding = {
  usesMessagingService: boolean;
  smartEncodingRecommended: boolean;
  setting: string;
  note: string;
};

export function SmsCostDashboardCard() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [smartEncoding, setSmartEncoding] = useState<SmartEncoding | null>(null);
  const [editThresholds, setEditThresholds] = useState(false);
  const [draft, setDraft] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sms-cost", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Unable to load SMS cost data.");
      setDashboard(body.dashboard);
      setThresholds(body.thresholds);
      setSmartEncoding(body.smartEncoding);
      setDraft(body.thresholds);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load SMS cost data.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveThresholds() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/sms-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_thresholds", ...draft })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed.");
      setThresholds(body.thresholds);
      setDraft(body.thresholds);
      setEditThresholds(false);
      showToast("SMS cost thresholds saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <MessageSquare className="h-4 w-4" aria-hidden />
            SMS cost (today)
          </h3>
          <p className="mt-1 text-xs text-admin-muted">
            Segment telemetry only — no phone numbers, message bodies, or customer PII.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn--ghost inline-flex items-center gap-2 !text-xs"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {dashboard ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="SMS sends" value={String(dashboard.sends)} />
            <Metric
              label="Est. segments"
              value={String(dashboard.estimatedSegments)}
              sub={
                dashboard.actualSegments != null
                  ? `Actual (reconciled): ${dashboard.actualSegments}`
                  : "Actual: pending reconcile"
              }
            />
            <Metric
              label="Est. spend"
              value={`$${dashboard.estimatedSpend.toFixed(2)}`}
              sub={
                dashboard.actualSpend != null
                  ? `Actual: $${dashboard.actualSpend.toFixed(2)}`
                  : undefined
              }
            />
            <Metric label="Multi-segment %" value={`${dashboard.multiSegmentPct}%`} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-admin-border/70 bg-black/20 p-3 text-xs">
              <div className="mb-2 font-medium text-white">By category</div>
              <ul className="space-y-1 text-admin-muted">
                {Object.entries(dashboard.byCategory).map(([name, row]) => (
                  <li key={name} className="flex justify-between gap-2">
                    <span>{name}</span>
                    <span>
                      {row.sends} sends · {row.estimatedSegments} est seg
                      {row.actualSegments != null ? ` · ${row.actualSegments} actual` : ""}
                    </span>
                  </li>
                ))}
                {!Object.keys(dashboard.byCategory).length ? <li>No sends yet today.</li> : null}
              </ul>
            </div>
            <div className="rounded-lg border border-admin-border/70 bg-black/20 p-3 text-xs">
              <div className="mb-2 font-medium text-white">Segment buckets</div>
              <ul className="space-y-1 text-admin-muted">
                <li>1 segment: {dashboard.segmentBuckets.one}</li>
                <li>2 segments: {dashboard.segmentBuckets.two}</li>
                <li>3 segments: {dashboard.segmentBuckets.three}</li>
                <li>4+ segments: {dashboard.segmentBuckets.fourPlus}</li>
              </ul>
            </div>
          </div>

          {dashboard.topTemplates.length ? (
            <div className="rounded-lg border border-admin-border/70 bg-black/20 p-3 text-xs">
              <div className="mb-2 font-medium text-white">Top templates by segments</div>
              <ul className="space-y-1 text-admin-muted">
                {dashboard.topTemplates.map((row) => (
                  <li key={row.templateKey} className="flex justify-between gap-2">
                    <span className="truncate">{row.templateKey}</span>
                    <span>
                      {row.totalSegments} seg · {row.sends} sends
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <p className="text-xs text-admin-muted">Loading SMS cost telemetry…</p>
      ) : null}

      {thresholds && draft ? (
        <div className="rounded-lg border border-admin-border/70 bg-black/15 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-medium text-white">Daily alert thresholds</span>
            <button
              type="button"
              className="admin-btn admin-btn--ghost !px-2 !py-1 !text-[10px]"
              onClick={() => setEditThresholds((v) => !v)}
            >
              {editThresholds ? "Cancel" : "Edit"}
            </button>
          </div>
          {editThresholds ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-admin-muted">
                Segment warning
                <input
                  className="admin-input mt-1 w-full"
                  type="number"
                  value={draft.dailySegmentWarning}
                  onChange={(e) => setDraft({ ...draft, dailySegmentWarning: Number(e.target.value) })}
                />
              </label>
              <label className="text-admin-muted">
                Segment critical
                <input
                  className="admin-input mt-1 w-full"
                  type="number"
                  value={draft.dailySegmentCritical}
                  onChange={(e) => setDraft({ ...draft, dailySegmentCritical: Number(e.target.value) })}
                />
              </label>
              <label className="text-admin-muted">
                Dollar warning
                <input
                  className="admin-input mt-1 w-full"
                  type="number"
                  step="0.01"
                  value={draft.dailyDollarWarning}
                  onChange={(e) => setDraft({ ...draft, dailyDollarWarning: Number(e.target.value) })}
                />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn--primary sm:col-span-3 !text-xs"
                disabled={saving}
                onClick={() => void saveThresholds()}
              >
                {saving ? "Saving…" : "Save thresholds"}
              </button>
            </div>
          ) : (
            <p className="text-admin-muted">
              Warning {thresholds.dailySegmentWarning} segments · Critical {thresholds.dailySegmentCritical} ·
              Dollar warning ${thresholds.dailyDollarWarning.toFixed(2)}. Alerts are in-app only (never SMS).
            </p>
          )}
        </div>
      ) : null}

      {smartEncoding ? (
        <p className="text-[11px] text-admin-muted">
          Twilio Smart Encoding: {smartEncoding.usesMessagingService ? "Messaging Service detected" : "No Messaging Service"}.
          {smartEncoding.smartEncodingRecommended
            ? ` Enable via ${smartEncoding.setting}. ${smartEncoding.note}`
            : ` ${smartEncoding.note}`}
        </p>
      ) : null}

      <button
        type="button"
        className="admin-btn admin-btn--ghost !text-xs"
        disabled={sendingTest}
        onClick={() => {
          if (
            !window.confirm(
              "Send a test SMS alert to all Super Admin recipients?\n\nThis will bill one SMS per recipient."
            )
          ) {
            return;
          }
          setSendingTest(true);
          void (async () => {
            try {
              const res = await fetch("/api/admin/sms-cost", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send_test_alert" })
              });
              const body = await res.json();
              if (!res.ok || !body.ok) throw new Error(body.error || "Test SMS failed.");
              showToast(`Test SMS sent to ${body.recipientCount} recipient(s).`, "success");
            } catch (error) {
              showToast(error instanceof Error ? error.message : "Test SMS failed.", "error");
            } finally {
              setSendingTest(false);
            }
          })();
        }}
      >
        {sendingTest ? "Sending test SMS…" : "Send test SMS to all recipients"}
      </button>
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-admin-border/70 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-admin-muted">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
      {sub ? <div className="text-[10px] text-admin-muted">{sub}</div> : null}
    </div>
  );
}
