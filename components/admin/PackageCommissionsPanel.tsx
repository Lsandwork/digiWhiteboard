"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, ExternalLink, MessageSquarePlus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type {
  PackageCommissionMode,
  PackageCommissionRow,
  PackageCommissionSaleCategory,
  PackageCommissionStatus
} from "@/lib/staff/package-commissions";
import {
  calculatePercentCommission,
  formatCommissionCurrency
} from "@/lib/staff/package-commissions";

type TrainerOption = {
  id: string;
  full_name: string;
  email: string;
};

type Summary = {
  pending: number;
  approved: number;
  paid: number;
  needsReview: number;
  disputed: number;
};

type Payload = {
  rows: PackageCommissionRow[];
  summary?: Summary;
  trainers?: TrainerOption[];
  canManage: boolean;
  canComment: boolean;
  currentUser: { email: string | null; role: string | null; adminUserId?: string | null };
};

type FilterKey = "all" | "package" | "class" | "pending_review";

const emptyForm = {
  dog_name: "",
  owner_name: "",
  trainer_user_id: "",
  trainer_name: "",
  trainer_email: "",
  sale_category: "package" as PackageCommissionSaleCategory,
  package_type: "",
  gingr_transaction_url: "",
  package_sale_amount: "",
  commission_mode: "amount" as PackageCommissionMode,
  commission_percent: "",
  commission_amount: "",
  sold_at: "",
  status: "Pending" as PackageCommissionStatus,
  notes: ""
};

function formatSoldDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function statusBadgeClass(status: PackageCommissionStatus) {
  switch (status) {
    case "Pending":
      return "bg-amber-500/15 text-amber-200 border-amber-400/30";
    case "Approved":
      return "bg-emerald-500/15 text-emerald-200 border-emerald-400/30";
    case "Paid":
      return "bg-sky-500/15 text-sky-200 border-sky-400/30";
    case "Needs Review":
      return "bg-orange-500/15 text-orange-200 border-orange-400/30";
    case "Disputed":
      return "bg-rose-500/15 text-rose-200 border-rose-400/30";
    default:
      return "bg-white/10 text-white border-white/10";
  }
}

function saleCategoryLabel(category: PackageCommissionSaleCategory) {
  return category === "class" ? "Class" : "Package";
}

export function PackageCommissionsPanel({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [commentRowId, setCommentRowId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentConcern, setCommentConcern] = useState<"note" | "dispute">("note");
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvImportErrors, setCsvImportErrors] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");

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

  async function postAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin/package-commissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to update package commission row.");
    return body;
  }

  async function saveRow() {
    setBusy(true);
    try {
      const payload = { ...form };
      if (payload.commission_mode === "percent") {
        const computed = calculatePercentCommission(payload.package_sale_amount, payload.commission_percent);
        if (computed == null) {
          throw new Error("Enter a valid package sale total and percentage to calculate commission.");
        }
        payload.commission_amount = formatCommissionCurrency(computed);
      }
      await postAction({
        action: editingId ? "update" : "create",
        id: editingId,
        ...payload
      });
      showToast(editingId ? "Commission record updated." : "Commission record added.", "success");
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save commission record.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(id: string) {
    setBusy(true);
    try {
      await postAction({ action: "delete", id });
      showToast("Commission record deleted.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete row.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRow(id: string) {
    setBusy(true);
    try {
      await postAction({ action: "confirm", id });
      showToast("Commission confirmed and approved.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to confirm commission.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(id: string) {
    setBusy(true);
    try {
      await postAction({ action: "mark_paid", id });
      showToast("Commission marked as paid.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to mark commission paid.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!commentRowId || !commentBody.trim()) return;
    setBusy(true);
    try {
      await postAction({
        action: "comment",
        row_id: commentRowId,
        body: commentBody,
        concern_type: commentConcern === "dispute" ? "dispute" : null
      });
      showToast(
        commentConcern === "dispute"
          ? "Dispute sent to admin and management for review."
          : "Comment sent to admin and management.",
        "success"
      );
      setCommentBody("");
      setCommentConcern("note");
      setCommentRowId(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to submit comment.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    if (!csvText.trim()) return;
    setBusy(true);
    setCsvImportErrors([]);
    try {
      const body = await postAction({ action: "import_csv", csv: csvText });
      const imported = Number(body.imported ?? body.rows?.length ?? 0);
      const failed = Number(body.failed ?? body.errors?.length ?? 0);
      const errors = Array.isArray(body.errors)
        ? body.errors.map((entry: { line?: number; message?: string }) =>
            `Row ${entry.line ?? "?"}: ${entry.message ?? "Unable to import"}`
          )
        : [];
      setCsvImportErrors(errors);

      if (imported > 0 && failed === 0) {
        showToast(`Imported ${imported} commission row(s).`, "success");
        setCsvText("");
        setCsvFileName(null);
        setShowCsvImport(false);
        setCsvImportErrors([]);
      } else if (imported > 0) {
        showToast(`Imported ${imported} row(s); ${failed} failed.`, "success");
      } else {
        showToast(errors[0] ?? "Unable to import CSV.", "error");
      }
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to import CSV.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onCsvFileChosen(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      setCsvFileName(file.name);
      setCsvImportErrors([]);
    } catch {
      showToast("Unable to read that CSV file.", "error");
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const body = await postAction({ action: "export_csv" });
      const blob = new Blob([body.csv ?? ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "package-class-commissions.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to export CSV.", "error");
    } finally {
      setBusy(false);
    }
  }

  function selectTrainer(trainerUserId: string) {
    const trainer = (data?.trainers ?? []).find((entry) => entry.id === trainerUserId);
    setForm((current) => ({
      ...current,
      trainer_user_id: trainerUserId,
      trainer_name: trainer?.full_name ?? "",
      trainer_email: trainer?.email ?? ""
    }));
  }

  const rows = data?.rows ?? [];
  const canManage = data?.canManage ?? false;
  const canComment = data?.canComment ?? false;
  const summary = data?.summary;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "package") return row.sale_category === "package";
      if (filter === "class") return row.sale_category === "class";
      if (filter === "pending_review") return row.status === "Pending" || row.status === "Needs Review" || row.status === "Disputed";
      return true;
    });
  }, [rows, filter]);

  const percentCommissionPreview = useMemo(() => {
    if (form.commission_mode !== "percent") return null;
    return calculatePercentCommission(form.package_sale_amount, form.commission_percent);
  }, [form.commission_mode, form.commission_percent, form.package_sale_amount]);

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "package", label: "Packages" },
    { key: "class", label: "Classes" },
    { key: "pending_review", label: "Pending Review" }
  ];

  return (
    <div className={embedded ? "space-y-5" : "crossover-dashboard space-y-5"}>
      {!embedded ? (
        <header className="admin-page-header">
          <div>
            <h2 className="admin-page-title">Package &amp; Class Commissions</h2>
            <p className="admin-page-subtitle">
              Track packages and classes sold, confirm commissions with management, and let trainers review their earnings.
            </p>
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

      {summary ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Pending", value: summary.pending, tone: "text-amber-200" },
            { label: "Approved", value: summary.approved, tone: "text-emerald-200" },
            { label: "Paid", value: summary.paid, tone: "text-sky-200" },
            { label: "Needs Review", value: summary.needsReview, tone: "text-orange-200" },
            { label: "Disputed", value: summary.disputed, tone: "text-rose-200" }
          ].map((card) => (
            <article key={card.label} className="crossover-card p-4">
              <p className="text-xs uppercase tracking-wide text-admin-muted">{card.label}</p>
              <p className={`mt-1 text-2xl font-bold ${card.tone}`}>{formatCurrency(card.value)}</p>
            </article>
          ))}
        </section>
      ) : null}

      {canManage ? (
        <section className="crossover-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="crossover-card__title">{editingId ? "Edit Commission Record" : "Add Commission Record"}</h3>
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
            <label className="block">
              <span className="admin-label">Sale type</span>
              <select
                className="admin-input"
                value={form.sale_category}
                onChange={(e) => setForm({ ...form, sale_category: e.target.value as PackageCommissionSaleCategory })}
              >
                <option value="package">Package</option>
                <option value="class">Class</option>
              </select>
            </label>
            <label className="block">
              <span className="admin-label">Trainer</span>
              <select className="admin-input" value={form.trainer_user_id} onChange={(e) => selectTrainer(e.target.value)}>
                <option value="">Select trainer</option>
                {(data?.trainers ?? []).map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.full_name} ({trainer.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="block"><span className="admin-label">Dog name</span><input className="admin-input" value={form.dog_name} onChange={(e) => setForm({ ...form, dog_name: e.target.value })} /></label>
            <label className="block"><span className="admin-label">Owner name</span><input className="admin-input" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></label>
            <label className="block"><span className="admin-label">Package / class type</span><input className="admin-input" value={form.package_type} onChange={(e) => setForm({ ...form, package_type: e.target.value })} placeholder="6-Session Private, Group Class 4-pack" /></label>
            <div className="block">
              <span className="admin-label">Commission entry</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`crossover-btn ${form.commission_mode === "amount" ? "crossover-btn--primary" : "crossover-btn--ghost"}`}
                  onClick={() => setForm({ ...form, commission_mode: "amount" })}
                >
                  Dollar amount
                </button>
                <button
                  type="button"
                  className={`crossover-btn ${form.commission_mode === "percent" ? "crossover-btn--primary" : "crossover-btn--ghost"}`}
                  onClick={() => setForm({ ...form, commission_mode: "percent" })}
                >
                  Percentage
                </button>
              </div>
            </div>
            {form.commission_mode === "percent" ? (
              <>
                <label className="block">
                  <span className="admin-label">Package / class total sold</span>
                  <input
                    className="admin-input"
                    value={form.package_sale_amount}
                    onChange={(e) => setForm({ ...form, package_sale_amount: e.target.value })}
                    placeholder="$1,200"
                    inputMode="decimal"
                  />
                </label>
                <label className="block">
                  <span className="admin-label">Trainer commission %</span>
                  <input
                    className="admin-input"
                    value={form.commission_percent}
                    onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                    placeholder="10"
                    inputMode="decimal"
                  />
                </label>
                <div className="block md:col-span-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-admin-muted">Calculated trainer commission</p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {percentCommissionPreview != null ? formatCommissionCurrency(percentCommissionPreview) : "—"}
                  </p>
                  <p className="mt-1 text-sm text-admin-muted">
                    Auto-calculates from the package/class sale total × percentage. This amount is what the trainer receives.
                  </p>
                </div>
              </>
            ) : (
              <label className="block">
                <span className="admin-label">Commission amount</span>
                <input
                  className="admin-input"
                  value={form.commission_amount}
                  onChange={(e) => setForm({ ...form, commission_amount: e.target.value })}
                  placeholder="$120"
                />
              </label>
            )}
            <label className="block md:col-span-2"><span className="admin-label">Gingr transaction URL</span><input className="admin-input" value={form.gingr_transaction_url} onChange={(e) => setForm({ ...form, gingr_transaction_url: e.target.value })} placeholder="https://..." /></label>
            <label className="block"><span className="admin-label">Date sold</span><input className="admin-input" type="date" value={form.sold_at.slice(0, 10)} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} /></label>
            <label className="block">
              <span className="admin-label">Status</span>
              <select className="admin-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PackageCommissionStatus })}>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Paid">Paid</option>
                <option value="Needs Review">Needs Review</option>
                <option value="Disputed">Disputed</option>
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="admin-label">Notes</span>
              <textarea className="crossover-input min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
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
          <span className="crossover-link-btn">{filteredRows.length} shown</span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {filterButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              className={`crossover-btn ${filter === button.key ? "crossover-btn--primary" : "crossover-btn--ghost"}`}
              onClick={() => setFilter(button.key)}
            >
              {button.label}
            </button>
          ))}
        </div>

        {loading ? <p className="text-sm text-admin-muted">Loading commission records…</p> : null}
        <div className="overflow-x-auto">
          <table className="crossover-table w-full min-w-[980px]">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dog</th>
                <th>Owner</th>
                <th>Trainer</th>
                <th>Package / Class</th>
                <th>Gingr</th>
                <th>Commission</th>
                <th>Status</th>
                <th>Sold</th>
                <th>Confirmed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{saleCategoryLabel(row.sale_category)}</td>
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
                  <td>
                    <div>{row.commission_amount}</div>
                    {row.commission_mode === "percent" && row.commission_percent ? (
                      <div className="text-xs text-admin-muted">
                        {row.commission_percent}% of {row.package_sale_amount ?? "sale"}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{formatSoldDate(row.sold_at)}</td>
                  <td>
                    {row.confirmed_at ? (
                      <div className="text-xs text-admin-muted">
                        <p>{row.confirmed_by ?? "Confirmed"}</p>
                        <p>{formatSoldDate(row.confirmed_at)}</p>
                      </div>
                    ) : "—"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canComment ? (
                        <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" onClick={() => setCommentRowId(row.id)}>
                          <MessageSquarePlus className="h-4 w-4" /> Comment
                        </button>
                      ) : null}
                      {canManage ? (
                        <>
                          {row.status !== "Approved" && row.status !== "Paid" ? (
                            <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" disabled={busy} onClick={() => void confirmRow(row.id)}>
                              <CheckCircle2 className="h-4 w-4" /> Confirm
                            </button>
                          ) : null}
                          {row.status !== "Paid" ? (
                            <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" disabled={busy} onClick={() => void markPaid(row.id)}>
                              Mark Paid
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1"
                            onClick={() => {
                              setEditingId(row.id);
                              setForm({
                                dog_name: row.dog_name,
                                owner_name: row.owner_name,
                                trainer_user_id: row.trainer_user_id ?? "",
                                trainer_name: row.trainer_name,
                                trainer_email: row.trainer_email ?? "",
                                sale_category: row.sale_category,
                                package_type: row.package_type,
                                gingr_transaction_url: row.gingr_transaction_url,
                                package_sale_amount: row.package_sale_amount ?? "",
                                commission_mode: row.commission_mode ?? (row.commission_percent ? "percent" : "amount"),
                                commission_percent: row.commission_percent ?? "",
                                commission_amount: row.commission_amount,
                                sold_at: row.sold_at.slice(0, 10),
                                status: row.status,
                                notes: row.notes ?? ""
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </button>
                          <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-1" disabled={busy} onClick={() => void deleteRow(row.id)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                    {row.comments.length ? (
                      <div className="mt-2 space-y-1 text-xs text-admin-muted">
                        {row.comments.map((comment) => (
                          <p key={comment.id}>
                            <span className="font-bold text-white">{comment.author}:</span> {comment.body}
                            {comment.concern_type === "dispute" ? <span className="ml-1 text-rose-200">(Dispute)</span> : null}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !filteredRows.length ? (
            <p className="mt-4 text-sm text-admin-muted">
              {canManage ? "No commission records yet." : "No commission records assigned to you yet."}
            </p>
          ) : null}
        </div>
      </section>

      <Modal open={Boolean(commentRowId)} title="Add Comment" onClose={() => { setCommentRowId(null); setCommentBody(""); setCommentConcern("note"); }}>
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={`crossover-btn ${commentConcern === "note" ? "crossover-btn--primary" : "crossover-btn--ghost"}`} onClick={() => setCommentConcern("note")}>
            General note
          </button>
          <button type="button" className={`crossover-btn ${commentConcern === "dispute" ? "crossover-btn--primary" : "crossover-btn--ghost"}`} onClick={() => setCommentConcern("dispute")}>
            Dispute
          </button>
        </div>
        <label className="grid gap-2">
          <span className="admin-label">{commentConcern === "dispute" ? "Describe the dispute" : "Your note"}</span>
          <textarea className="crossover-input min-h-32" value={commentBody} maxLength={800} onChange={(e) => setCommentBody(e.target.value)} placeholder={commentConcern === "dispute" ? "Explain why this commission needs review." : "Add a note for admin and management."} />
        </label>
        <div className="mt-4 flex justify-end">
          <button type="button" className="crossover-btn crossover-btn--primary" disabled={busy || !commentBody.trim()} onClick={() => void submitComment()}>
            Send to Admin &amp; Management
          </button>
        </div>
      </Modal>

      <Modal
        open={showCsvImport}
        title="Import Trainer Commissions CSV"
        onClose={() => {
          setShowCsvImport(false);
          setCsvImportErrors([]);
        }}
      >
        <div className="space-y-3 text-sm text-admin-muted">
          <p>
            Upload a Gingr <strong className="text-admin-text">Trainers Invoice Report</strong> CSV (trainer name on its
            own line, then Date / Owner&apos;s Name / Dog&apos;s Name / Class/Program / Sales / Trainer Commission (%) /
            Trainer Share ($)). Multi-trainer sections and $0 share rows are supported.
          </p>
          <p>You can also paste the same CSV, or a Fitdog export CSV with the older column headers.</p>
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-admin-border bg-admin-panel/40 px-4 py-6 text-center transition hover:border-fitdog-orange/50">
          <Upload className="h-5 w-5 text-fitdog-orange" />
          <span className="text-sm font-semibold text-admin-text">
            {csvFileName ? `Selected: ${csvFileName}` : "Choose CSV file"}
          </span>
          <span className="text-xs text-admin-muted">.csv only — PDF import is not supported yet</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onCsvFileChosen(file);
              event.target.value = "";
            }}
          />
        </label>

        <label className="mt-4 grid gap-2">
          <span className="admin-label">Or paste CSV</span>
          <textarea
            className="crossover-input min-h-48 font-mono text-xs"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setCsvFileName(null);
              setCsvImportErrors([]);
            }}
            placeholder={"Amanda Smith Nguyen\nDate,Owner's Name,Dog's Name,Class/Program,Price ($),Discount ($),Sales ($),Trainer Commission (%),Trainer Share ($)\n07/02/2026,Owner,Dog,Cool Tricks,$55.00,$0.00,$55.00,50.00%,$27.50"}
          />
        </label>

        {csvImportErrors.length ? (
          <div className="mt-3 max-h-32 overflow-auto rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            <p className="mb-1 font-semibold">Some rows could not be imported:</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {csvImportErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="crossover-btn crossover-btn--ghost"
            onClick={() => {
              setShowCsvImport(false);
              setCsvImportErrors([]);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="crossover-btn crossover-btn--primary"
            disabled={busy || !csvText.trim()}
            onClick={() => void importCsv()}
          >
            Import
          </button>
        </div>
      </Modal>
    </div>
  );
}
