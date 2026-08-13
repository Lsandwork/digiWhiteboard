"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    const safeMessage = /did not match the expected pattern/i.test(message)
      ? "Something went wrong. Reload the page and try again."
      : message;
    setToasts((current) => [...current, { id, message: safeMessage, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), toast.type === "error" ? 6000 : 4000)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="admin-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`admin-toast admin-toast--${toast.type}`}
            role="status"
            // Inline colors beat Clear/Light theme remaps that force navy text onto dark chips.
            style={{ color: "#f8fafc", backgroundColor: "#0f172a" }}
          >
            {toast.type === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#fca5a5" }} />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#86efac" }} />
            )}
            <span className="admin-toast__message" style={{ color: "#f8fafc" }}>
              {toast.message}
            </span>
            <button
              type="button"
              className="admin-toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              style={{ color: "#f8fafc" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
