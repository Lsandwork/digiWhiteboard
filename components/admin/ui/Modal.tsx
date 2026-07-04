"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
};

export function Modal({ open, title, description, onClose, children, footer, size = "md" }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`admin-modal admin-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <div>
            <h2 id={titleId} className="admin-modal-title">{title}</h2>
            {description ? <p className="admin-modal-description">{description}</p> : null}
          </div>
          <button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {footer ? <footer className="admin-modal-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
