"use client";

import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Clock, UserRound } from "lucide-react";
import { BulkShiftLogComposer } from "@/components/admin/BulkShiftLogComposer";
import type { OpsCommandCenterSnapshot } from "@/lib/ops-command-center/snapshot";
import type { OpsWorkItem } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import type { WorkItemAction } from "@/lib/ops-command-center/work-item-actions";
import { MY_SHIFT_ASSETS, myShiftPortraitForName } from "@/lib/ops-command-center/my-shift-assets";
import { toCrossoverBulkPayload } from "@/lib/staff/bulk-shift-log";
import type { ShiftLogType } from "@/lib/staff/front-desk-log";

function greetingBucket(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(now)
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatClock(now: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(now);
}

function formatTime(now: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit"
  }).format(now);
}

function relativeFrom(value: string | null | undefined) {
  if (!value) return "";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "";
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function defaultLogTypeForDepartment(department: string): ShiftLogType {
  switch (department) {
    case "Training":
      return "Training Note";
    case "Grooming":
      return "Grooming Note";
    case "Daycare":
      return "Daycare Note";
    case "Transportation":
      return "Transportation Note";
    default:
      return "General Shift Note";
  }
}

function activityTone(category: string) {
  const token = category.toLowerCase();
  if (token.includes("groom")) return "#00c7e8";
  if (token.includes("transport") || token.includes("taxi")) return "#00d879";
  if (token.includes("train") || token.includes("class")) return "#f59a00";
  if (token.includes("check") || token.includes("arriv")) return "#079bff";
  if (token.includes("incident") || token.includes("alert")) return "#ff263d";
  return "#6d20d8";
}

function severityClass(severity: string) {
  if (severity === "critical") return "myshift-sev--critical";
  if (severity === "high") return "myshift-sev--high";
  if (severity === "attention") return "myshift-sev--attention";
  return "myshift-sev--informational";
}

function severityMark(severity: string) {
  if (severity === "critical") return "!";
  if (severity === "high") return "2";
  return "1";
}

function priorityRank(priority: string) {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "attention") return 2;
  return 3;
}

type MyShiftAlertRow = {
  id: string;
  severity: string;
  title: string;
  detail: string | null;
  hrefTab: string | null;
  dogName?: string | null;
};

function activeIssuesForImportantAlerts(data: OpsCommandCenterSnapshot): MyShiftAlertRow[] {
  const fromNeeds = (data.needsAttention || []).filter((item) => item.kind === "active_issue");
  const fromWork = (data.openWork || [])
    .filter((item) => item.kind === "active_issue")
    .map((item) => ({
      id: item.id,
      severity: item.priority,
      title: item.title,
      detail: item.detail,
      hrefTab: item.hrefTab || "active_issues",
      dogName: item.dogName ?? null
    }));
  const seen = new Set<string>();
  return [...fromNeeds, ...fromWork]
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => priorityRank(a.severity) - priorityRank(b.severity))
    .slice(0, 4);
}

function KpiGlyph({ name }: { name: "dogs" | "boarding" | "taxi" | "classes" | "grooming" }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  if (name === "dogs") {
    return (
      <svg {...common}>
        <path
          d="M7.2 10.2c1.1 0 1.9-.9 1.9-1.9S8.3 6.4 7.2 6.4 5.3 7.3 5.3 8.3s.8 1.9 1.9 1.9zm9.6 0c1.1 0 1.9-.9 1.9-1.9s-.8-1.9-1.9-1.9-1.9.9-1.9 1.9.8 1.9 1.9 1.9zM5.6 6.1c.8 0 1.4-.6 1.4-1.4S6.4 3.3 5.6 3.3 4.2 3.9 4.2 4.7s.6 1.4 1.4 1.4zm12.8 0c.8 0 1.4-.6 1.4-1.4s-.6-1.4-1.4-1.4-1.4.6-1.4 1.4.6 1.4 1.4 1.4zM12 9.2c-3.4 0-6.2 2.5-6.2 6.1 0 2.6 2.1 4.7 6.2 4.7s6.2-2.1 6.2-4.7c0-3.6-2.8-6.1-6.2-6.1z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (name === "boarding") {
    return (
      <svg {...common}>
        <path d="M4 18.5h16M5.5 18.5V11l6.5-4 6.5 4v7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 18.5v-4h6v4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "taxi") {
    return (
      <svg {...common}>
        <path d="M5 16h14l1.2-4.4A2 2 0 0 0 18.3 9H5.7a2 2 0 0 0-1.9 2.6L5 16z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 9l1.2-3h5.6L16 9M7.2 16v2.4M16.8 16v2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="12.6" r="0.9" fill="currentColor" />
        <circle cx="16" cy="12.6" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  if (name === "classes") {
    return (
      <svg {...common}>
        <path d="M3.5 10 12 6l8.5 4L12 14 3.5 10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M7 12v4.2c0 .7 2.2 2.3 5 2.3s5-1.6 5-2.3V12" stroke="currentColor" strokeWidth="1.8" />
        <path d="M20.5 10.2V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M8 4.5c1.4 0 2.2 1.5 2.2 1.5H14S14.8 4.5 16.2 4.5 19 6.4 19 8.2c0 2.4-2 4.3-4.4 4.3H9.4C7 12.5 5 10.6 5 8.2 5 6.4 6.6 4.5 8 4.5z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.2 12.6 7 19.5M15.8 12.6 17 19.5M10.2 12.6l-.6 6.9M13.8 12.6l.6 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MyShiftDashboard({
  data,
  loading,
  logBusy,
  busyItemId,
  onNavigate,
  onRefresh,
  onWorkItemAction,
  onSubmitShiftEntries
}: {
  data: OpsCommandCenterSnapshot;
  loading: boolean;
  logBusy: boolean;
  busyItemId?: string | null;
  onNavigate?: (tab: string) => void;
  onRefresh: () => void;
  onWorkItemAction: (itemId: string, action: WorkItemAction, title?: string | null) => void;
  onSubmitShiftEntries: (
    entries: Parameters<typeof toCrossoverBulkPayload>[0],
    defaults: Parameters<typeof toCrossoverBulkPayload>[1]
  ) => Promise<void>;
}) {
  const [now, setNow] = useState(() => new Date(data.generatedAt || Date.now()));

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const homeDepartment = data.homeDepartment || data.departmentHandoff?.department || "Front Desk";
  const assignOptions = data.departmentHandoff?.assignOptions?.length
    ? data.departmentHandoff.assignOptions
    : [homeDepartment];
  const pulse = data.facilityPulse;
  const team = data.teamOnShift || [];
  const visibleTeam = team.slice(0, 5);
  const extraTeam = Math.max(0, team.length - 5);
  const tasks: OpsWorkItem[] = (data.myTasks || []).map((task) => ({
    id: `task:${task.id}`,
    kind: "ops_task" as const,
    title: task.title,
    detail: task.notes,
    priority: task.priority,
    statusLabel: task.status.replace(/_/g, " "),
    dueAt: task.dueAt,
    hrefTab: "my_shift",
    completable: task.status !== "completed" && task.status !== "cancelled",
    taskId: task.id
  }));
  const taskRows = (tasks.length ? tasks : data.openWork || []).slice(0, 5);
  const alerts = activeIssuesForImportantAlerts(data);
  const activity = (data.recentEvents || []).slice(0, 5);
  const lead =
    team.find((member) => /lead|manager|coordinator/i.test(`${member.role} ${member.department}`))?.name ||
    data.departmentHandoff?.previousName ||
    null;
  const tools = new Set((data.tools || []).map((tool) => tool.tab));
  const additionalServices = data.groomerView?.enabled ? data.groomerView.additionalServices : [];

  function go(tab: string) {
    onNavigate?.(tab);
  }

  function openGingr() {
    window.location.href = "/gingr";
  }

  const kpis = [
    {
      key: "dogs",
      glyph: "dogs" as const,
      label: "Dogs Today",
      value: pulse?.dogsToday ?? data.shiftSummary.dogsOnFloor,
      tone: "blue",
      spark: MY_SHIFT_ASSETS.sparkline.blue,
      tab: "ops_command_center"
    },
    {
      key: "boarding",
      glyph: "boarding" as const,
      label: "Boarding Stays",
      value: pulse?.boardingStays ?? 0,
      tone: "purple",
      spark: MY_SHIFT_ASSETS.sparkline.purple,
      tab: "ops_command_center"
    },
    {
      key: "taxi",
      glyph: "taxi" as const,
      label: "Taxi Runs",
      value: pulse?.taxiRuns ?? 0,
      tone: "green",
      spark: MY_SHIFT_ASSETS.sparkline.green,
      tab: tools.has("route_generator") ? "route_generator" : "ops_command_center"
    },
    {
      key: "classes",
      glyph: "classes" as const,
      label: "Classes Today",
      value: pulse?.classesToday ?? 0,
      tone: "orange",
      spark: MY_SHIFT_ASSETS.sparkline.orange,
      tab: tools.has("trainer_ops") ? "trainer_ops" : "ops_command_center"
    },
    {
      key: "grooming",
      glyph: "grooming" as const,
      label: "Grooming Appts",
      value: pulse?.groomingAppts ?? data.liveCounts.grooming ?? 0,
      tone: "cyan",
      spark: MY_SHIFT_ASSETS.sparkline.cyan,
      tab: "grooming_push"
    }
  ];

  return (
    <section className="ruffops-myshift space-y-4">
      <img className="myshift-watermark" src={MY_SHIFT_ASSETS.pawWatermark} alt="" aria-hidden />

      {data.stale && !loading ? (
        <div className="myshift-banner">Live data is delayed. Showing the last good My Shift until the database responds.</div>
      ) : null}

      <header className="myshift-header">
        <div className="myshift-header__title-row">
          <img className="myshift-user-tile" src={MY_SHIFT_ASSETS.panel.userTile} alt="" />
          <div>
            <h2>My Shift</h2>
            <p className="lede">Your daily overview, tasks, and important updates.</p>
          </div>
        </div>
        <div className="myshift-meta">
          <div className="myshift-chip">
            <img src={MY_SHIFT_ASSETS.panel.calendar} alt="" />
            <div>
              <div className="v">{formatClock(now)}</div>
              <div className="k">{formatTime(now)}</div>
            </div>
          </div>
          <div className="myshift-chip myshift-chip--shift">
            <CheckCircle2 size={18} aria-hidden />
            <div>
              <div className="v">On Shift</div>
              <div className="k">
                Good {greetingBucket(now)}, {data.greetingName}
              </div>
            </div>
          </div>
          <button type="button" className="myshift-link myshift-refresh" onClick={onRefresh} disabled={loading}>
            {loading ? "Updating…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="myshift-kpis">
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            className={`myshift-kpi myshift-kpi--${kpi.tone}`}
            onClick={() => go(kpi.tab)}
            aria-label={`${kpi.label}: ${kpi.value}`}
          >
            <div className="myshift-kpi__top">
              <span className="icon">
                <KpiGlyph name={kpi.glyph} />
              </span>
              <div className="value">{kpi.value}</div>
            </div>
            <div className="label">{kpi.label}</div>
            <img className="spark" src={kpi.spark} alt="" aria-hidden />
          </button>
        ))}
      </div>

      <div className="myshift-grid">
        <div className="myshift-col">
          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.calendar} alt="" />
                Shift Details
              </h3>
              <button type="button" className="myshift-link" onClick={() => go("ops_command_center")}>
                View Schedule →
              </button>
            </div>
            <div className="myshift-shift">
              <div className="myshift-shift__meta">
                <div className="myshift-shift__row myshift-shift__row--live">
                  <span className="myshift-live-dot" aria-hidden />
                  <div>
                    <strong>On Shift</strong>
                    <div>{data.roleLabel}</div>
                  </div>
                </div>
                <div className="myshift-shift__row">
                  <Clock size={16} aria-hidden />
                  <div>
                    <strong>Signed in</strong>
                    <div>Shift hours are not stored in RuffOps</div>
                  </div>
                </div>
                <div className="myshift-shift__row">
                  <Building2 size={16} aria-hidden />
                  <div>
                    <strong>{homeDepartment}</strong>
                  </div>
                </div>
                {lead ? (
                  <div className="myshift-shift__row">
                    <UserRound size={16} aria-hidden />
                    <div>
                      Shift Lead
                      <div>
                        <strong>{lead}</strong>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <img className="myshift-hero" src={MY_SHIFT_ASSETS.heroDog} alt="Golden retriever in the Shift Details panel" />
            </div>
          </section>

          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.alerts} alt="" />
                Important Alerts
              </h3>
              <button type="button" className="myshift-link" onClick={() => go("active_issues")}>
                View All →
              </button>
            </div>
            {alerts.length ? (
              alerts.map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  className="myshift-alert"
                  onClick={() => alert.hrefTab && go(alert.hrefTab)}
                >
                  <span className={`myshift-sev ${severityClass(alert.severity)}`}>{severityMark(alert.severity)}</span>
                  <span>
                    <strong>{alert.title}</strong>
                    {alert.detail ? <div className="myshift-sub">{alert.detail}</div> : null}
                    {alert.dogName ? <div className="myshift-sub">{alert.dogName}</div> : null}
                  </span>
                </button>
              ))
            ) : (
              <p className="myshift-empty">No active issues right now.</p>
            )}
          </section>

          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.lightning} alt="" />
                Quick Actions
              </h3>
            </div>
            <div className="myshift-actions">
              <button type="button" className="myshift-action" onClick={openGingr}>
                <img src={MY_SHIFT_ASSETS.quick.addDog} alt="" />
                <span>Add Dog</span>
              </button>
              <button type="button" className="myshift-action" onClick={openGingr}>
                <img src={MY_SHIFT_ASSETS.quick.bookService} alt="" />
                <span>Book Service</span>
              </button>
              <button
                type="button"
                className="myshift-action"
                onClick={() => (tools.has("route_generator") ? go("route_generator") : openGingr())}
              >
                <img src={MY_SHIFT_ASSETS.quick.taxi} alt="" />
                <span>Schedule Taxi</span>
              </button>
              <button
                type="button"
                className="myshift-action"
                onClick={() => (tools.has("trainer_ops") ? go("trainer_ops") : go("package_commissions"))}
              >
                <img src={MY_SHIFT_ASSETS.quick.addClass} alt="" />
                <span>Add Class</span>
              </button>
              <button type="button" className="myshift-action" onClick={() => go("crossover_communication")}>
                <img src={MY_SHIFT_ASSETS.quick.teamLog} alt="" />
                <span>Open Team Log</span>
              </button>
            </div>
          </section>
        </div>

        <div className="myshift-col">
          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.tasks} alt="" />
                Today’s Tasks
              </h3>
              <button type="button" className="myshift-link" onClick={() => go("ops_command_center")}>
                View All →
              </button>
            </div>
            {taskRows.length ? (
              taskRows.map((task) => {
                const done = !task.completable || /completed|resolved|cancelled/i.test(task.statusLabel || "");
                const busy = busyItemId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`myshift-task${done ? " myshift-task--done" : ""}`}
                    aria-pressed={done}
                    disabled={busy}
                    onClick={() => {
                      if (done || !task.completable) {
                        if (task.hrefTab) go(task.hrefTab);
                        return;
                      }
                      onWorkItemAction(task.id, "resolved", task.title);
                    }}
                  >
                    <span className={`myshift-check${done ? " myshift-check--done" : ""}`} aria-hidden>
                      {done ? "✓" : ""}
                    </span>
                    <span>{busy ? "Saving…" : task.title}</span>
                  </button>
                );
              })
            ) : (
              <p className="myshift-empty">Nothing assigned to you yet.</p>
            )}
          </section>

          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.team} alt="" />
                Team on Shift
              </h3>
              <button type="button" className="myshift-link" onClick={() => go("staff_directory")}>
                View Team →
              </button>
            </div>
            {visibleTeam.length ? (
              <div className="myshift-team">
                {visibleTeam.map((member) => {
                  const photo = myShiftPortraitForName(member.name);
                  return (
                    <div key={member.id} className="myshift-person">
                      <div className="myshift-avatar">
                        {photo ? <img src={photo} alt="" /> : initials(member.name)}
                        <span className="dot" aria-label="Active in directory" />
                      </div>
                      <div className="n">{member.name.split(" ")[0]}</div>
                      <div className="d">{member.department}</div>
                    </div>
                  );
                })}
                {extraTeam ? (
                  <button type="button" className="myshift-more" onClick={() => go("staff_directory")}>
                    +{extraTeam}
                    <span className="myshift-more__label">More</span>
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="myshift-empty">No active directory members loaded.</p>
            )}
          </section>

          <section className="myshift-panel">
            <div className="myshift-panel__head">
              <h3>
                <img src={MY_SHIFT_ASSETS.panel.pulse} alt="" />
                Recent Activity
              </h3>
              <button type="button" className="myshift-link" onClick={() => go("ops_command_center")}>
                View All →
              </button>
            </div>
            {activity.length ? (
              activity.map((event) => (
                <div key={event.id} className="myshift-activity">
                  <span className="myshift-dot" style={{ background: activityTone(event.category || event.eventType) }} />
                  <div>
                    <div>
                      <strong>{formatTime(new Date(event.occurredAt))}</strong>
                      <span className="myshift-activity__title"> {event.title}</span>
                    </div>
                    <div className="myshift-sub">{[event.summary, event.actorName].filter(Boolean).join(" — ")}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="myshift-empty">No operational events yet today.</p>
            )}
          </section>
        </div>
      </div>

      {additionalServices.length ? (
        <section className="myshift-panel">
          <div className="myshift-panel__head">
            <h3>Today’s additional services</h3>
            <span className="myshift-sub">{additionalServices.length}</span>
          </div>
          <p className="myshift-sub" style={{ marginBottom: 8 }}>
            Gingr facility calendar{data.groomerView?.serviceDate ? ` · ${data.groomerView.serviceDate}` : ""}
          </p>
          <ul className="myshift-note-list">
            {additionalServices.slice(0, 8).map((service) => (
              <li key={service.id}>
                <strong>{service.serviceName}</strong>
                <div className="myshift-sub">
                  {[service.dogName, service.ownerName].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="myshift-panel">
        <div className="myshift-panel__head">
          <h3>Today’s handoff notes</h3>
          <button type="button" className="myshift-link" onClick={() => go("crossover_communication")}>
            Team Log →
          </button>
        </div>
        <p className="myshift-sub">
          All departments · today (Pacific). Notes posted today stay here until midnight, then this list clears.
        </p>
        <BulkShiftLogComposer
          key={homeDepartment}
          title="Shift Entry Log"
          subtitle="Add a note for today’s facility handoff. Every department sees it on My Shift and Team Log until midnight Pacific."
          busy={logBusy}
          assignOptions={assignOptions}
          defaultLogType={defaultLogTypeForDepartment(homeDepartment)}
          defaultDepartment={homeDepartment}
          submitLabel="Post to Team Log"
          onSubmit={onSubmitShiftEntries}
        />
        {data.departmentHandoff?.shiftNotes?.length ? (
          <ul className="myshift-note-list">
            {data.departmentHandoff.shiftNotes.slice(0, 8).map((note) => (
              <li key={note.id}>
                <strong>{note.title}</strong>
                {note.detail ? <div className="myshift-sub">{note.detail}</div> : null}
                <div className="myshift-sub">
                  {note.department ? `${note.department} · ` : ""}
                  {note.submittedBy}
                  {note.createdAt ? ` · ${relativeFrom(note.createdAt)}` : ""}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="myshift-empty">No Team Log notes posted today yet.</p>
        )}
      </section>
    </section>
  );
}
