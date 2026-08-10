"use client";

import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

const LOCK_KEY = "ruffops.session.lock";

export function useRuffOpsLock() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    setLocked(window.sessionStorage.getItem(LOCK_KEY) === "1");
  }, []);
  return {
    locked,
    lock() {
      window.sessionStorage.setItem(LOCK_KEY, "1");
      setLocked(true);
    },
    unlock() {
      window.sessionStorage.removeItem(LOCK_KEY);
      setLocked(false);
    }
  };
}

export function LockRuffOpsButton({ onLock }: { onLock: () => void }) {
  return (
    <button type="button" className="admin-btn-secondary px-2 py-1 text-xs" onClick={onLock} title="Lock RuffOps on shared computers">
      <Lock className="h-3.5 w-3.5" />
      Lock
    </button>
  );
}

export function RuffOpsLockScreen({
  username,
  onUnlockRequest
}: {
  username: string;
  onUnlockRequest: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[#070b12]/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101826] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Lock className="h-5 w-5" />
          <h2 className="text-xl font-semibold">RuffOps Locked</h2>
        </div>
        <p className="text-sm text-admin-muted">
          Session preserved for {username}. Re-enter password to unlock this shared Fitdog computer.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const ok = await onUnlockRequest(password);
            setBusy(false);
            if (!ok) setError("Unlock failed. Check password.");
            else setPassword("");
          }}
        >
          <input
            type="password"
            className="admin-input w-full"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button type="submit" className="admin-btn-primary w-full min-h-11" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock RuffOps"}
          </button>
        </form>
      </div>
    </div>
  );
}
