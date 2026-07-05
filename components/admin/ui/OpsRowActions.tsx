"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, MoreHorizontal } from "lucide-react";

export type OpsRowMenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type OpsRowActionsProps = {
  busy: boolean;
  onDetail: () => void;
  onResolve: () => void;
  menuItems: OpsRowMenuItem[];
  className?: string;
};

export function OpsRowActions({ busy, onDetail, onResolve, menuItems, className }: OpsRowActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className={`crossover-row-actions${className ? ` ${className}` : ""}`} ref={ref}>
      <button type="button" className="crossover-icon-btn" disabled={busy} aria-label="View details" title="View details" onClick={onDetail}>
        <Eye aria-hidden className="crossover-icon-btn__lucide" />
      </button>
      <button type="button" className="crossover-icon-btn crossover-icon-btn--resolve" disabled={busy} aria-label="Mark resolved" title="Mark resolved" onClick={onResolve}>
        <CheckCircle2 aria-hidden className="crossover-icon-btn__lucide" />
      </button>
      <div className="crossover-more-menu">
        <button type="button" className="crossover-icon-btn" disabled={busy} aria-label="More actions" onClick={() => setOpen((value) => !value)}>
          <MoreHorizontal aria-hidden className="crossover-icon-btn__lucide" />
        </button>
        {open ? (
          <div className="crossover-more-menu__panel" role="menu">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className="crossover-more-menu__item"
                disabled={busy || item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
