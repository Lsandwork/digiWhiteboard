"use client";

import { X } from "lucide-react";

export function OpsSidePanel({
  open,
  title,
  onClose,
  children,
  footer,
  theme = "admin"
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  theme?: "admin" | "floor";
}) {
  if (!open) return null;
  const floor = theme === "floor";
  return (
    <div className={`admin-drawer-backdrop${floor ? " ops-floor__drawer-backdrop admin-on-dark" : ""}`} role="dialog" aria-modal="true">
      <div
        className={
          floor
            ? "ops-floor__drawer admin-on-dark flex max-h-[92vh] w-full max-w-lg flex-col"
            : "admin-drawer-panel flex max-h-[92vh] w-full max-w-lg flex-col"
        }
      >
        <div className={floor ? "ops-floor__drawer-head" : "flex items-center justify-between gap-3 border-b border-admin-border px-4 py-3"}>
          <h3 className={floor ? "ops-floor__dog" : "text-base font-semibold text-white"}>{title}</h3>
          <button
            type="button"
            className={floor ? "ops-floor__act ops-floor__act--ghost" : "admin-btn-secondary px-2 py-1"}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={floor ? "ops-floor__drawer-body" : "min-h-0 flex-1 overflow-y-auto px-4 py-3"}>{children}</div>
        {footer ? <div className={floor ? "ops-floor__drawer-foot" : "border-t border-admin-border px-4 py-3"}>{footer}</div> : null}
      </div>
    </div>
  );
}
