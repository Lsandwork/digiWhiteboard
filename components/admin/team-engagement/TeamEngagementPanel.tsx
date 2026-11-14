"use client";

import "@/app/styles/team-engagement.css";

import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import { humanizeUnknownError } from "@/lib/safe-url";

type NavItem = { id: string; label: string; icon: string; view: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

type ContextPayload = {
  actor: {
    userId: string;
    name: string;
    tier: string | null;
    tierLabel: string | null;
    permissions: string[];
    scope: { all: boolean; label: string; departments: { key: string; label: string }[] };
  };
  nav: NavGroup[];
  defaultSection: string | null;
  storageReady: boolean;
  migration: string;
  features: Record<string, boolean>;
};

function TeIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`ro-te-icon ${className}`.trim()}
      style={{
        backgroundColor: "currentColor",
        maskImage: `url(/assets/ruffops/team-engagement/icons/${name}.svg)`,
        WebkitMaskImage: `url(/assets/ruffops/team-engagement/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "contain"
      }}
      aria-hidden
    />
  );
}

function tierClass(tier: string | null) {
  if (tier === "super_admin") return "ro-te-role ro-te-role--super-admin";
  if (tier === "admin") return "ro-te-role ro-te-role--admin";
  if (tier === "management") return "ro-te-role ro-te-role--management";
  return "ro-te-role";
}

function EmptyIllustration({ name, title, body }: { name: string; title: string; body: string }) {
  return (
    <div className="ro-te-empty">
      <img src={`/assets/ruffops/team-engagement/illustrations/${name}.svg`} alt="" className="ro-te-empty__art" />
      <h3>{title}</h3>
      <p className="ro-te-muted">{body}</p>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="ro-te-card ro-te-stat">
      <div className="ro-te-muted ro-te-stat__label">{label}</div>
      <div className="ro-te-stat__value">{value}</div>
      {hint ? <div className="ro-te-muted ro-te-stat__hint">{hint}</div> : null}
    </div>
  );
}

function OverviewBody({ data }: { data: Record<string, unknown> }) {
  const headcount = data.headcount as { total?: number; byDepartment?: { label: string; count: number }[] } | undefined;
  const recognition = data.recognition as { published?: number; participation?: { authors: number; recipients: number; team: number } } | undefined;
  const moderation = data.moderation as { pending?: number; reported?: number; escalated?: number } | null | undefined;
  const recent = (data.recentBarkOuts as Array<{ recipientName: string; authorName: string; categoryLabel: string; message: string }>) ?? [];
  return (
    <div className="ro-te-stack">
      <div className="ro-te-stat-grid">
        <StatCard label="Team headcount" value={headcount?.total ?? "—"} />
        <StatCard label="Recognitions (30 days)" value={recognition?.published ?? 0} />
        {moderation ? (
          <>
            <StatCard label="Pending moderation" value={moderation.pending ?? 0} />
            <StatCard label="Open reports" value={moderation.reported ?? 0} />
          </>
        ) : null}
      </div>
      <section className="ro-te-card ro-te-section">
        <h3 className="ro-te-section__title">Recent Bark Outs</h3>
        {recent.length === 0 ? (
          <EmptyIllustration name="empty-bark-outs" title="No Bark Outs yet" body="When teammates recognize each other, the latest posts show up here." />
        ) : (
          <ul className="ro-te-list">
            {recent.map((row, index) => (
              <li key={index} className="ro-te-list__item">
                <strong>{row.recipientName}</strong>
                <span className="ro-te-muted"> · {row.categoryLabel}</span>
                <p>{row.message}</p>
                <p className="ro-te-muted ro-te-list__meta">From {row.authorName}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TableBody({ rows, columns }: { rows: Record<string, unknown>[]; columns: { key: string; label: string }[] }) {
  if (!rows.length) {
    return <EmptyIllustration name="empty-staff" title="Nothing to show" body="There are no records in this view for your scope yet." />;
  }
  return (
    <div className="ro-te-table-wrap">
      <table className="ro-te-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.userId ?? index)}>
              {columns.map((col) => (
                <td key={col.key}>{String(row[col.key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarkOutList({ items }: { items: Record<string, unknown>[] }) {
  if (!items.length) return <EmptyIllustration name="empty-bark-outs" title="No Bark Outs" body="Adjust filters or check back after teammates post recognition." />;
  return (
    <ul className="ro-te-list">
      {items.map((item) => (
        <li key={String(item.id)} className="ro-te-list__item">
          <div className="ro-te-list__row">
            <strong>{String(item.recipientName ?? item.recipient_name ?? "Teammate")}</strong>
            <span className="ro-te-muted"> · {String(item.categoryLabel ?? item.status ?? "")}</span>
          </div>
          <p>{String(item.message ?? "")}</p>
          <p className="ro-te-muted ro-te-list__meta">
            {String(item.authorName ?? item.author_name ?? "")}
            {item.publishedAt ? ` · ${new Date(String(item.publishedAt)).toLocaleDateString()}` : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ModerationBody({
  data,
  onAction
}: {
  data: Record<string, unknown>;
  onAction: (action: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const items = (data.items as Record<string, unknown>[]) ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  async function act(id: string, action: string) {
    setBusyId(id);
    try {
      await onAction(action, { id });
    } finally {
      setBusyId(null);
    }
  }
  if (!items.length) {
    return <EmptyIllustration name="empty-bark-outs" title="Moderation queue is clear" body="New submissions that need a person will land here." />;
  }
  return (
    <ul className="ro-te-list">
      {items.map((item) => (
        <li key={String(item.id)} className="ro-te-list__item ro-te-mod-item">
          <p>{String(item.message ?? "")}</p>
          <p className="ro-te-muted">
            {String(item.authorName)} → {String(item.recipientName)}
          </p>
          <div className="ro-te-actions">
            <button type="button" className="ro-te-btn ro-te-btn--primary" disabled={busyId === String(item.id)} onClick={() => void act(String(item.id), "approve_bark_out")}>
              Approve
            </button>
            <button
              type="button"
              className="ro-te-btn ro-te-btn--ghost"
              disabled={busyId === String(item.id)}
              onClick={() => void act(String(item.id), "reject_bark_out")}
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function viewBody(view: string, data: unknown, onAction: (action: string, payload: Record<string, unknown>) => Promise<void>) {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (view === "overview") return <OverviewBody data={record} />;
  if (view === "staff") {
    const items = (record.items as Record<string, unknown>[]) ?? [];
    return (
      <TableBody
        rows={items}
        columns={[
          { key: "name", label: "Name" },
          { key: "title", label: "Title" },
          { key: "departmentLabel", label: "Department" },
          { key: "roleLabel", label: "Role" }
        ]}
      />
    );
  }
  if (view === "bark_outs") return <BarkOutList items={(record.items as Record<string, unknown>[]) ?? []} />;
  if (view === "moderation") return <ModerationBody data={record} onAction={onAction} />;
  if (view === "analytics") {
    return record.series ? (
      <EmptyIllustration name="empty-analytics" title="Engagement analytics" body="Charts use live Bark Out and program data from your selected filters." />
    ) : (
      <EmptyIllustration name="empty-analytics" title="No analytics for this filter" body="Try widening the date range or choosing another department." />
    );
  }
  if (view === "audit") {
    const items = (record.items as Record<string, unknown>[]) ?? [];
    return (
      <TableBody
        rows={items.map((row) => ({
          ...row,
          at: row.occurredAt ? new Date(String(row.occurredAt)).toLocaleString() : row.occurred_at
        }))}
        columns={[
          { key: "at", label: "When" },
          { key: "actorName", label: "Who" },
          { key: "action", label: "Action" },
          { key: "targetLabel", label: "Target" }
        ]}
      />
    );
  }
  return (
    <section className="ro-te-card ro-te-section">
      <p className="ro-te-muted">This section loads live data from Team Engagement. Use the actions in the admin API for changes not shown here yet.</p>
      <pre className="ro-te-debug">{JSON.stringify(record, null, 2).slice(0, 4000)}</pre>
    </section>
  );
}

export default function TeamEngagementPanel() {
  const [context, setContext] = useState<ContextPayload | null>(null);
  const [active, setActive] = useState<NavItem | null>(null);
  const [viewData, setViewData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [viewLoading, setViewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { ok, status, body } = await fetchAdminJson<ContextPayload & { error?: string; code?: string }>(
        "/api/admin/team-engagement?view=context"
      );
      if (!ok) {
        setContext(null);
        setError(body.error ?? (status === 403 ? "You do not have access to Manage Team Engagement." : "Team Engagement could not load."));
        return;
      }
      setContext(body);
      const items = body.nav.flatMap((group) => group.items);
      const pick = items.find((item) => item.id === body.defaultSection) ?? items[0] ?? null;
      setActive(pick);
    } catch (err) {
      setError(humanizeUnknownError(err, "Team Engagement could not load."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadView = useCallback(
    async (item: NavItem | null) => {
      if (!item || !context?.storageReady) return;
      setViewLoading(true);
      setViewError(null);
      try {
        const { ok, body } = await fetchAdminJson(`/api/admin/team-engagement?view=${encodeURIComponent(item.view)}`);
        if (!ok) {
          setViewData(null);
          setViewError((body as { error?: string }).error ?? "This section could not load.");
          return;
        }
        setViewData(body);
      } catch (err) {
        setViewError(humanizeUnknownError(err, "This section could not load."));
      } finally {
        setViewLoading(false);
      }
    },
    [context?.storageReady]
  );

  const postAction = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      const { ok, body } = await fetchAdminJson("/api/admin/team-engagement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      if (!ok) throw new Error((body as { error?: string }).error ?? "That action failed.");
      if (active) await loadView(active);
    },
    [active, loadView]
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    void loadView(active);
  }, [active, loadView]);

  if (loading) {
    return <p className="ro-te-muted p-4">Loading Team Engagement…</p>;
  }

  if (error || !context) {
    return (
      <div className="ro-te-shell ro-te-shell--denied">
        <EmptyIllustration
          name="access-denied"
          title="Manage Team Engagement"
          body={error ?? "You do not have access to this workspace."}
        />
      </div>
    );
  }

  if (!context.storageReady) {
    return (
      <div className="ro-te-shell">
        <EmptyIllustration
          name="access-denied"
          title="Database setup required"
          body={`Run ${context.migration} in the Supabase SQL Editor before using Team Engagement.`}
        />
      </div>
    );
  }

  return (
    <div className="ro-te-shell">
      <header className="ro-te-header">
        <div>
          <h2 className="ro-te-header__title">Manage Team Engagement</h2>
          <p className="ro-te-muted">
            {context.actor.scope.label}
            {context.actor.tierLabel ? (
              <>
                {" "}
                · <span className={tierClass(context.actor.tier)}>{context.actor.tierLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="ro-te-btn ro-te-btn--ghost" onClick={() => void loadContext()}>
          Refresh
        </button>
      </header>
      <div className="ro-te-layout">
        <nav className="ro-te-sidebar" aria-label="Team Engagement sections">
          {context.nav.map((group) => (
            <div key={group.id} className="ro-te-sidebar__group">
              <div className="ro-te-sidebar__label">{group.label}</div>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`ro-te-sidebar__link ${active?.id === item.id ? "ro-te-sidebar__link--active" : ""}`}
                      onClick={() => setActive(item)}
                    >
                      <TeIcon name={item.icon} />
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className="ro-te-main">
          <h3 className="ro-te-main__title">{active?.label ?? "Overview"}</h3>
          {viewLoading ? <p className="ro-te-muted">Loading…</p> : null}
          {viewError ? <p className="ro-te-error">{viewError}</p> : null}
          {!viewLoading && !viewError && active ? viewBody(active.view, viewData, postAction) : null}
        </main>
      </div>
    </div>
  );
}