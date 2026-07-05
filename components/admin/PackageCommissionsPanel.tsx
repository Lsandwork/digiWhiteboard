"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, MessageSquarePlus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { PackageCommissionRow } from "@/lib/staff/package-commissions";

type Payload = {
  rows: PackageCommissionRow[];
  canManage: boolean;
  canComment: boolean;
  currentUser: { email: string | null; role: string | null };
};

const emptyForm = {
  dog_name: "",
  owner_name: "",
  package_type: "",
  gingr_transaction_url: "",
  commission_amount: "",
  sold_at: ""
};

function formatSoldDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function PackageCommissionsPanel({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkRow, setLinkRow] = useState<PackageCommissionRow | null>(null);
  const [commentRowId, setCommentRowId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/package-commissions", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load package commissions.");
      setData(body as Payload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load package commissions.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveRow() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/package-commissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          id: editingId,
          ...form
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save package commission row.");
      showToast(editingId ? "Package commission updated." : "Package commission added.", "success");
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save package commission row.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/package-commissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to delete row.");
      showToast("Package commission deleted.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete row.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!commentRowId || !commentBody.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/package-commissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "comment", row_id: commentRowId, body: commentBody })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to submit comment.");
      showToast("Comment sent to admin and management.", "success");
      setCommentBody("");
      setCommentRowId(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to submit comment.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/package-commissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import_csv", csv: csvText })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to import CSV.");
      showToast(`Imported ${body.rows?.length ?? 0} package commission row(s).`, "success");
      setCsvText("");
      setShowCsvImport(false);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to import CSV.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/package-commissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "export_csv" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to export CSV.");
      const blob = new Blob([body.csv ?? ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "package-commissions.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to export CSV.", "error");
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  const canManage = data?.canManage ?? false;
  const canComment = data?.canComment ?? false;

  return (
    <div className={embedded ? "space-y-5" : "crossover-dashboard space-y-5"}>
      {!embedded ? (
        <header className="admin-page-header">
          <div>
            <h2 className="admin-page-title">Package Commissions</h2>
            <p className="admin-page-subtitle">Track packages sold to clients, Gingr transaction links, and trainer commissions.</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" disabled={busy} onClick={() => setShowCsvImport(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </button>
              <button type="button" className="crossover-btn crossover-btn--outline inline-flex items-center gap-2" disabled={busy} onClick={() => void exportCsv()}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          ) : null}
        </header>
      ) : null}

      {canManage ? (
        <section className="crossover-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="crossover-card__title">{editingId ? "Edit Package Commission" : "Add Package Commission"}</h3>
            {embedded ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" disabled={busy} onClick={() => setShowCsvImport(true)}>
                  <Upload className="h-4 w-4" /> Import CSV
                </button>
                <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" disabled={busy} onClick={() => void exportCsv()}>
                  <Download className="h-4 w-4" /> Export CSV
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="admin-label">Dog name</span><input className="admin-input" value={form.dog_name} onChange={(e) => setForm({ ...form, dog_name: e.target.value })} /></label>
            <label className="block"><span className="admin-label">Owner name</span><input className="admin-input" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
            <label className="block"><span className="admin-label">Package type</span><input className="admin-input" value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} /></label>
            <label className="block"><span className="admin-label">Commission</span><input className="admin-input" value={form.commission_amount} onChange={(e) => setForm({ ...form, commission_amount: e.target.value })} placeholder="$120" /></label>
            <label className="block md:col-span-2"><span className="admin-label">Gingr transaction URL</span><input className="admin-input" value={form.gingr_transaction_url} onChange={(e) => setForm({ ...form, gingr_transaction_url: e.target.value })} placeholder="https://..." /></label>
            <label className="block"><span className="admin-label">Date sold</span><input className="admin-input" type="date" value={form.sold_at.slice(0, 10)} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2" disabled={busy} onClick={() => void saveRow()}>
              <Plus className="h-4 w-4" /> {editingId ? "Save Changes" : "Add Row"}
            </button>
            {editingId ? (
              <button type="button" className="crossover-btn crossover-btn--ghost" disabled={busy} onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="crossover-card p-5">
        <div className="crossover-card__header crossover-card__header--compact">
          <h3 className="crossover-card__title">Commission Records</h3>
          <span className="crossover-link-btn">{rows.length} total</span>
        </div>
        {loading ? <p className="text-sm text-admin-muted">Loading package commissions…</p> : null}
        <div className="overflow-x-auto">
          <table className="crossover-table w-full min-w-[760px]">
            <thead>
              <tr>
                <th>Dog</th>
                <th>Owner</th>
                <th>Trainer</th>
                <th>Package</th>
                <th>Gingr</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Sold</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.dog_name}</td>
                  <td>{row.owner_name}</td>
                  <td>{row.trainer_name}</td>
                  <td>{row.package_type}</td>
                  <td>
                    {row.gingr_transaction_url ? (
                      <a href={row.gingr_transaction_url} target="_blank" rel="noopener noreferrer" className="crossover-link-btn inline-flex items-center gap-1">
                        View <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : "—"}
                  </td>
                  <td>{row.commission_amount}</td>
                  <td>{row.status ?? "Pending"}</td>
                  <td>{formatSoldDate(row.sold_at)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canComment ? (
                        <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" onClick={() => setCommentRowId(row.id)}>
                          <MessageSquarePlus className="h-4 w-4" /> Comment
                        </button>
                      ) : null}
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1"
                            onClick={() => {
                              setEditingId(row.id);
                              setForm({
                                dog_name: row.dog_name,
                                owner_name: row.owner_name,
                                package_type: row.package_type,
                                gingr_transaction_url: row.gingr_transaction_url,
                                commission_amount: row.commission_amount,
                                sold_at: row.sold_at.slice(0, 10)
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </button>
                          <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" onClick={() => void deleteRow(row.id)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                    {row.comments.length ? (
                      <div className="mt-2 space-y-1 text-xs text-admin-muted">
                        {row.comments.map((comment) => (
                          <p key={comment.id}><span className="font-bold text-white">{comment.author}:</span> {comment.body}</p>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length ? <p className="mt-4 text-sm text-admin-muted">No package commission records yet.</p> : null}
        </div>
      </section>

      <Modal open={Boolean(linkRow)} title={`Gingr Transaction — ${linkRow?.dog_name ?? ""}`} onClose={() => setLinkRow(null)}>
        {linkRow?.gingr_transaction_url ? (
          <div className="space-y-4">
            <p className="text-sm text-admin-muted">Open the Gingr transaction in a new window.</p>
            <a href={linkRow.gingr_transaction_url} target="_blank" rel="noopener noreferrer" className="crossover-btn crossover-btn--primary inline-flex items-center gap-2">
              Open Gingr Transaction <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(commentRowId)} title="Add Comment" onClose={() => { setCommentRowId(null); setCommentBody(""); }}>
        <label className="grid gap-2">
          <span className="admin-label">Your concern or note</span>
          <textarea className="crossover-input min-h-32" value={commentBody} maxLength={800} onChange={(e) => setCommentBody(e.target.value)} placeholder="Describe the concern about this commission record." />
        </label>
        <div className="mt-4 flex justify-end">
          <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || !commentBody.trim()} onClick={() => void submitComment()}>
            Send to Admin & Management
          </button>
        </div>
      </Modal>

      <Modal open={showCsvImport} title="Import Package Commissions CSV" onClose={() => setShowCsvImport(false)}>
        <p className="mb-3 text-sm text-admin-muted">Expected columns: dog_name, owner_name, package_type, gingr_transaction_url, commission_amount, sold_at</p>
        <textarea className="crossover-input min-h-48 font-mono text-xs" value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="dog_name,owner_name,package_type,gingr_transaction_url,commission_amount,sold_at" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setShowCsvImport(false)}>Cancel</button>
          <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || !csvText.trim()} onClick={() => void importCsv()}>Import</button>
        </div>
      </Modal>
    </div>
  );
}
