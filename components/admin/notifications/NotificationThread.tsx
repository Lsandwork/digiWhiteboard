"use client";

import type { CrossoverReply } from "@/lib/staff/admin-ops";
import type { ManagementReport, SupportComment } from "@/lib/staff/management-reports";

export type ThreadEntry = {
  id: string;
  author: string;
  role: string;
  body: string;
  createdAt: string;
  isInternal?: boolean;
  kind: "submission" | "reply" | "status" | "crossover";
};

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function roleLabel(role: string) {
  if (role === "admin" || role === "management" || role === "owner_admin" || role === "manager_admin") return "Management";
  if (role === "team_leader") return "Team Lead";
  if (role === "groomer") return "Groomer";
  if (role === "trainer") return "Trainer";
  return role || "Staff";
}

export function buildSupportThreadEntries(report: ManagementReport, showInternal: boolean): ThreadEntry[] {
  const entries: ThreadEntry[] = [];
  const original =
    report.groomer_submission_details?.description ?? report.summary ?? report.write_up_details?.statement_of_violation ?? "";
  if (original) {
    entries.push({
      id: `submission-${report.id}`,
      author: report.submitted_by_name ?? report.created_by ?? "Staff",
      role: report.submitted_by_role ?? "staff",
      body: original,
      createdAt: report.created_at,
      kind: "submission"
    });
  }
  for (const comment of report.comments ?? []) {
    if (comment.visibility === "internal" && !showInternal) continue;
    entries.push({
      id: comment.id,
      author: comment.user_name,
      role: comment.user_role,
      body: comment.body,
      createdAt: comment.created_at,
      isInternal: comment.visibility === "internal",
      kind: "reply"
    });
  }
  for (const audit of report.audit_history ?? []) {
    if (audit.action === "change_status" || audit.action === "close" || audit.action === "reopen") {
      entries.push({
        id: audit.id,
        author: audit.performed_by,
        role: "system",
        body: `${audit.action.replace(/_/g, " ")}${audit.new_value ? `: ${audit.new_value}` : ""}`,
        createdAt: audit.created_at,
        kind: "status"
      });
    }
  }
  return entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function buildCrossoverThreadEntries(
  subject: string,
  message: string,
  createdBy: string | null,
  createdAt: string,
  replies: CrossoverReply[]
): ThreadEntry[] {
  const entries: ThreadEntry[] = [
    {
      id: "crossover-original",
      author: createdBy ?? "Staff",
      role: "staff",
      body: `${subject}\n\n${message}`,
      createdAt,
      kind: "crossover"
    }
  ];
  for (const reply of replies) {
    entries.push({
      id: reply.id,
      author: reply.created_by ?? "Staff",
      role: "staff",
      body: reply.message,
      createdAt: reply.created_at,
      kind: "reply"
    });
  }
  return entries;
}

export function NotificationThread({ entries }: { entries: ThreadEntry[] }) {
  if (entries.length === 0) {
    return <p className="notif-hub-thread__empty">No conversation history yet.</p>;
  }

  return (
    <div className="notif-hub-thread">
      {entries.map((entry) => (
        <article
          key={entry.id}
          className={`notif-hub-thread__entry notif-hub-thread__entry--${entry.kind} ${entry.isInternal ? "notif-hub-thread__entry--internal" : ""}`}
        >
          <header className="notif-hub-thread__header">
            <div>
              <strong className="notif-hub-thread__author">{entry.author}</strong>
              <span className="notif-hub-thread__role">{roleLabel(entry.role)}</span>
              {entry.isInternal ? <span className="notif-hub-thread__internal">Internal note</span> : null}
            </div>
            <time className="notif-hub-thread__time">{formatTime(entry.createdAt)}</time>
          </header>
          <p className="notif-hub-thread__body">{entry.body}</p>
        </article>
      ))}
    </div>
  );
}

export type { SupportComment };
