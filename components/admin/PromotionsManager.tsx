"use client";

import { GripVertical, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import type { LobbyPromotion } from "@/lib/lobby/types";

type PromotionsManagerProps = {
  promotions: LobbyPromotion[];
  onToggle: (promotion: LobbyPromotion) => void;
};

export function PromotionsManager({ promotions, onToggle }: PromotionsManagerProps) {
  return (
    <section className="admin-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-black text-white">Promotions</h2>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input className="admin-input pl-9" placeholder="Search promotions..." aria-label="Search promotions" />
          </label>
          <select className="admin-select" aria-label="Filter by status">
            <option>All Status</option>
            <option>Active</option>
            <option>Hidden</option>
          </select>
          <button type="button" className="admin-btn-primary inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Add Promotion</button>
        </div>
      </div>

      <div className="space-y-3">
        {promotions.slice(0, 6).map((promotion) => (
          <article key={promotion.id} className="admin-promo-row">
            <GripVertical className="h-4 w-4 shrink-0 text-admin-muted" aria-hidden />
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-fitdog-orange/30 to-sky-500/20 text-lg">🐾</div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white">{promotion.title}</p>
              <p className="truncate text-sm text-admin-muted">{promotion.subtitle}</p>
            </div>
            <span className={`admin-badge ${promotion.active ? "admin-badge--green" : ""}`}>{promotion.active ? "Active" : "Hidden"}</span>
            <span className="hidden text-xs text-admin-muted sm:inline">Schedule: Always On</span>
            <button type="button" className="admin-icon-btn" aria-label={`Edit ${promotion.title}`}><Pencil className="h-4 w-4" /></button>
            <button type="button" className="admin-icon-btn" aria-label={`Toggle ${promotion.title}`} onClick={() => onToggle(promotion)}><MoreHorizontal className="h-4 w-4" /></button>
          </article>
        ))}
      </div>
    </section>
  );
}
