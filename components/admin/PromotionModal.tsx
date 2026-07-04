"use client";

import { useEffect, useState } from "react";
import type { LobbyPromotion } from "@/lib/lobby/types";
import { Modal } from "@/components/admin/ui/Modal";

type PromotionModalProps = {
  open: boolean;
  promotion?: LobbyPromotion | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
};

const emptyForm = {
  title: "",
  subtitle: "",
  category: "",
  icon_key: "",
  image_url: "",
  starts_at: "",
  ends_at: "",
  active: true,
  sort_order: 0
};

export function PromotionModal({ open, promotion, busy, onClose, onSave }: PromotionModalProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (promotion) {
      setForm({
        title: promotion.title,
        subtitle: promotion.subtitle ?? "",
        category: promotion.category ?? "",
        icon_key: promotion.icon_key ?? "",
        image_url: promotion.image_url ?? "",
        starts_at: promotion.starts_at ? promotion.starts_at.slice(0, 16) : "",
        ends_at: promotion.ends_at ? promotion.ends_at.slice(0, 16) : "",
        active: promotion.active,
        sort_order: promotion.sort_order
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, promotion]);

  return (
    <Modal
      open={open}
      title={promotion ? "Edit Promotion" : "Add Promotion"}
      description="Promotions appear in the lobby services slideshow when active."
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="admin-btn-primary" disabled={busy || !form.title.trim()} onClick={() => void onSave(form)}>
            {busy ? "Saving…" : promotion ? "Save changes" : "Add promotion"}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><input className="admin-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Subtitle"><input className="admin-input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
        <Field label="Category"><input className="admin-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Training" /></Field>
        <Field label="Icon key"><input className="admin-input" value={form.icon_key} onChange={(e) => setForm({ ...form, icon_key: e.target.value })} placeholder="Optional icon identifier" /></Field>
        <Field label="Image URL"><input className="admin-input" type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></Field>
        <Field label="Sort order"><input className="admin-input" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
        <Field label="Starts at"><input className="admin-input" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
        <Field label="Ends at"><input className="admin-input" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
        <label className="admin-toggle-row md:col-span-2">
          <span className="text-sm font-semibold text-white">Active</span>
          <button type="button" role="switch" aria-checked={form.active} className={`admin-toggle ${form.active ? "admin-toggle--on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}>
            <span className="admin-toggle__knob" />
          </button>
        </label>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="admin-label">{label}</span>{children}</label>;
}
