"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MoreHorizontal } from "lucide-react";

export type OpsRowMenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type OpsRowActionsProps = {
  busy: boolean;
  onDetail: () => void;
  /** Kept for call-site compatibility — Resolve lives in the overflow menu for a clean row. */
  onResolve?: () => void;
  resolveLabel?: string;
  menuItems: OpsRowMenuItem[];
  className?: string;
};

export function OpsRowActions({
  busy,
  onDetail,
  onResolve,
  resolveLabel = "Resolve",
  menuItems,
  className
}: OpsRowActionsProps) {
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

  const resolveItem: OpsRowMenuItem | null = onResolve
    ? {
        label: resolveLabel,
        onClick: onResolve
      }
    : null;

  const items = resolveItem
    ? [resolveItem, ...menuItems.filter((item) => item.label.toLowerCase() !== resolveLabel.toLowerCase())]
    : menuItems;

  return (
    <div className={`crossover-row-actions${className ? ` ${className}` : ""}`} ref={ref}>
      <button
        type="button"
        className="fitdog-action-icon-btn"
        disabled={busy}
        aria-label="View details"
        title="View details"
        onClick={onDetail}
      >
        <Eye aria-hidden className="h-[1.1rem] w-[1.1rem]" />
      </button>
      <div className="crossover-more-menu">
        <button
          type="button"
          className="fitdog-action-icon-btn"
          disabled={busy}
          aria-label="More actions"
          title="More actions"
          onClick={() => setOpen((value) => !value)}
        >
          <MoreHorizontal aria-hidden className="h-[1.1rem] w-[1.1rem]" />
        </button>
        {open ? (
          <div className="crossover-more-menu__panel" role="menu">
            {items.map((item) => (
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
