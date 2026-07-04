"use client";

import { useMemo, useState } from "react";
import { Copy, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { LobbyPromotion } from "@/lib/lobby/types";
import { AdminTable } from "@/components/admin/ui/AdminTable";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";
import { PromotionModal } from "@/components/admin/PromotionModal";

type PromotionsManagerProps = {
  promotions: LobbyPromotion[];
  onRefresh: () => Promise<void>;
  onToast: (message: string, type?: "success" | "error" | "info") => void;
};

type StatusFilter = "all" | "active" | "inactive" | "scheduled";

function promotionStatus(promotion: LobbyPromotion) {
  const now = Date.now();
  const starts = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
  const ends = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
  if (!promotion.active) return "inactive";
  if (starts && starts > now) return "scheduled";
  if (ends && ends < now) return "inactive";
  return "active";
}

export function PromotionsManager({ promotions, onRefresh, onToast }: PromotionsManagerProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LobbyPromotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LobbyPromotion | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    return promotions.filter((promotion) => {
      const status = promotionStatus(promotion);
      if (statusFilter === "active" && status !== "active") return false;
      if (statusFilter === "inactive" && status !== "inactive") return false;
      if (statusFilter === "scheduled" && status !== "scheduled") return false;
      const haystack = [promotion.title, promotion.subtitle, promotion.category].join(" ").toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [promotions, search, statusFilter]);

  async function savePromotion(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const body = {
        ...payload,
        starts_at: payload.starts_at ? new Date(String(payload.starts_at)).toISOString() : null,
        ends_at: payload.ends_at ? new Date(String(payload.ends_at)).toISOString() : null
      };

      const response = editing
        ? await fetch(`/api/lobby/promotions/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/lobby/promotions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save promotion.");
      onToast(editing ? "Promotion updated." : "Promotion added.", "success");
      setModalOpen(false);
      setEditing(null);
      await onRefresh();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Unable to save promotion.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function duplicatePromotion(promotion: LobbyPromotion) {
    setMenuId(null);
    setBusy(true);
    try {
      const response = await fetch("/api/lobby/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `${promotion.title} (Copy)`,
          subtitle: promotion.subtitle,
          category: promotion.category,
          icon_key: promotion.icon_key,
          image_url: promotion.image_url,
          starts_at: promotion.starts_at,
          ends_at: promotion.ends_at,
          active: false,
          sort_order: promotion.sort_order + 1
        })
      });
      if (!response.ok) throw new Error("Unable to duplicate promotion.");
      onToast("Promotion duplicated.", "success");
      await onRefresh();
    } catch {
      onToast("Unable to duplicate promotion.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(promotion: LobbyPromotion) {
    setMenuId(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/lobby/promotions/${promotion.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !promotion.active })
      });
      if (!response.ok) throw new Error("Unable to update promotion.");
      onToast(promotion.active ? "Promotion deactivated." : "Promotion activated.", "success");
      await onRefresh();
    } catch {
      onToast("Unable to update promotion.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deletePromotion() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/lobby/promotions/${deleteTarget.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete promotion.");
      onToast("Promotion deleted.", "success");
      setDeleteTarget(null);
      await onRefresh();
    } catch {
      onToast("Unable to delete promotion.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card p-5">
      <header className="admin-page-header mb-4">
        <div>
          <h2 className="admin-section-title">Promotions</h2>
          <p className="admin-section-helper">Manage lobby service promotions shown in the slideshow.</p>
        </div>
        <button type="button" className="admin-btn-primary inline-flex items-center gap-2" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Promotion
        </button>
      </header>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
          <input className="admin-input pl-9" placeholder="Search promotions..." aria-label="Search promotions" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="admin-select lg:w-48" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="scheduled">Scheduled</option>
        </select>
      </div>

      <AdminTable
        rows={filtered}
        rowKey={(row) => row.id}
        emptyTitle="No promotions found"
        emptyDescription="Try a different search or add your first promotion."
        columns={[
          { key: "title", header: "Title", render: (row) => <span className="font-semibold text-white">{row.title}</span> },
          { key: "subtitle", header: "Description", hideOnMobile: true, render: (row) => row.subtitle ?? "—" },
          { key: "status", header: "Status", render: (row) => {
            const status = promotionStatus(row);
            return (
              <span className={`admin-badge ${status === "active" ? "admin-badge--green" : status === "scheduled" ? "admin-badge--amber" : ""}`}>
                {status === "active" ? "Active" : status === "scheduled" ? "Scheduled" : "Inactive"}
              </span>
            );
          }},
          { key: "schedule", header: "Schedule", hideOnMobile: true, render: (row) => row.starts_at || row.ends_at ? `${row.starts_at ? new Date(row.starts_at).toLocaleDateString() : "Now"} – ${row.ends_at ? new Date(row.ends_at).toLocaleDateString() : "Open"}` : "Always on" }
        ]}
        actions={(row) => (
          <div className="relative flex justify-end gap-1">
            <button type="button" className="admin-icon-btn" aria-label={`Edit ${row.title}`} onClick={() => { setEditing(row); setModalOpen(true); }}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" className="admin-icon-btn" aria-label={`More actions for ${row.title}`} onClick={() => setMenuId(menuId === row.id ? null : row.id)}>
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuId === row.id ? (
              <div className="admin-action-menu">
                <button type="button" onClick={() => void duplicatePromotion(row)}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                <button type="button" onClick={() => void toggleActive(row)}>{row.active ? "Deactivate" : "Activate"}</button>
                <button type="button" className="text-red-300" onClick={() => { setDeleteTarget(row); setMenuId(null); }}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            ) : null}
          </div>
        )}
      />

      <PromotionModal open={modalOpen} promotion={editing} busy={busy} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={savePromotion} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete promotion?"
        description={`"${deleteTarget?.title}" will be permanently removed.`}
        confirmLabel="Delete promotion"
        danger
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deletePromotion()}
      />
    </section>
  );
}
