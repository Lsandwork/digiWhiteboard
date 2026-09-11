"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CARD_STUDIO_PATHS } from "@/lib/card-studio/constants";

type Stats = {
  issuedToday: number;
  issuedWeek: number;
  issuedMonth: number;
  awaitingPrint: number;
  failedJobs: number;
  reprintRequests: number;
  activePrinters: number;
  printerWarnings: Array<{ id: string; name: string; message: string | null; code: string }>;
  recentCards: Array<{ id: string; card_number: string; member_name: string | null; dog_name: string | null; status: string; issued_at: string | null }>;
  recentTemplates: Array<{ id: string; name: string; category: string; status: string; updated_at: string }>;
};

export function CardStudioDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/card-studio/dashboard", { credentials: "same-origin" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Unable to load dashboard.");
        if (!cancelled) setStats(json.stats);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="cs-card">{error}</div>;
  if (!stats) return <div className="cs-empty">Loading Card Studio…</div>;

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Card Studio</h1>
          <p>Fitdog ID card design, issuance, and printing. Club + Sports VIP is the print-ready template — change the dog name and top-left photo, then print.</p>
        </div>
        <div className="cs-actions">
          <Link className="cs-btn cs-btn--primary" href={CARD_STUDIO_PATHS.create}>Create Card</Link>
          <Link className="cs-btn" href={CARD_STUDIO_PATHS.designer}>Create Template</Link>
          <Link className="cs-btn" href={CARD_STUDIO_PATHS.printCenter}>Print Card</Link>
          <Link className="cs-btn" href={CARD_STUDIO_PATHS.batch}>Batch Print</Link>
          <Link className="cs-btn" href={CARD_STUDIO_PATHS.printers}>Manage Printers</Link>
          <Link className="cs-btn" href={CARD_STUDIO_PATHS.history}>View History</Link>
        </div>
      </div>
      <div className="cs-kpi-grid">
        <div className="cs-card"><h3>Issued today</h3><strong>{stats.issuedToday}</strong></div>
        <div className="cs-card"><h3>Issued this week</h3><strong>{stats.issuedWeek}</strong></div>
        <div className="cs-card"><h3>Issued this month</h3><strong>{stats.issuedMonth}</strong></div>
        <div className="cs-card"><h3>Awaiting print</h3><strong>{stats.awaitingPrint}</strong></div>
        <div className="cs-card"><h3>Failed jobs</h3><strong>{stats.failedJobs}</strong></div>
        <div className="cs-card"><h3>Reprint requests</h3><strong>{stats.reprintRequests}</strong></div>
        <div className="cs-card"><h3>Active printers</h3><strong>{stats.activePrinters}</strong></div>
        <div className="cs-card"><h3>Printer warnings</h3><strong>{stats.printerWarnings.length}</strong></div>
      </div>
      <div className="cs-kpi-grid" style={{ marginTop: 16, gridTemplateColumns: "1fr 1fr" }}>
        <div className="cs-card">
          <h3>Recent card activity</h3>
          {stats.recentCards.length === 0 ? <p className="cs-empty">No cards issued yet.</p> : (
            <table className="cs-table">
              <thead><tr><th>Card</th><th>Member</th><th>Status</th></tr></thead>
              <tbody>
                {stats.recentCards.map((card) => (
                  <tr key={card.id}>
                    <td>{card.card_number}</td>
                    <td>{card.member_name} {card.dog_name ? `· ${card.dog_name}` : ""}</td>
                    <td><span className="cs-status">{card.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="cs-card">
          <h3>Recent templates</h3>
          {stats.recentTemplates.length === 0 ? <p className="cs-empty">No templates yet.</p> : (
            <table className="cs-table">
              <thead><tr><th>Template</th><th>Status</th></tr></thead>
              <tbody>
                {stats.recentTemplates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td><Link href={`${CARD_STUDIO_PATHS.designer}?id=${tpl.id}`}>{tpl.name}</Link></td>
                    <td>{tpl.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
