"use client";

import { X } from "lucide-react";

export function OpsSidePanel({
  open,
  title,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="admin-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="admin-drawer-panel flex max-h-[92vh] w-full max-w-lg flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-admin-border px-4 py-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button type="button" className="admin-btn-secondary px-2 py-1" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <div className="border-t border-admin-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
