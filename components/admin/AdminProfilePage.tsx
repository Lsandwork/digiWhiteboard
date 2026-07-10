"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Trash2, UserRound } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";

type AdminProfilePageProps = {
  username: string;
  role?: string | null;
  displayLabel?: string | null;
};

const MAX_AVATAR_DIMENSION = 256;

/** Resize + compress client-side so we store a small data URL, not a huge upload. */
async function fileToResizedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a valid image."));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not supported in this browser.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function initials(username: string) {
  const base = username.split("@")[0] ?? username;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function AdminProfilePage({ username, role, displayLabel }: AdminProfilePageProps) {
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const response = await fetch("/api/admin/profile", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setAvatarUrl(body.avatarUrl ?? null);
      } catch {
        // Non-fatal — the profile photo is optional.
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/change-own-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirm_password: confirmPassword })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update password.");
      setPassword("");
      setConfirmPassword("");
      showToast("Password updated.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update password.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function savePhoto(nextAvatarUrl: string | null) {
    setSavingPhoto(true);
    try {
      const response = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: nextAvatarUrl })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update profile photo.");
      if (body.demo) {
        showToast(body.message ?? "Demo mode — not saved.", "info");
        return;
      }
      setAvatarUrl(body.avatarUrl ?? null);
      showToast(nextAvatarUrl ? "Profile photo updated." : "Profile photo removed.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update profile photo.", "error");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file (JPG or PNG).", "error");
      return;
    }
    setSavingPhoto(true);
    try {
      const resized = await fileToResizedDataUrl(file);
      await savePhoto(resized);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not process that image.", "error");
      setSavingPhoto(false);
    }
  }

  const roleLabel = displayLabel ?? role ?? "Staff";

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Settings</h2>
          <p className="admin-page-subtitle">Manage your personal profile and account security.</p>
        </div>
      </header>

      <section className="crossover-card p-5">
        <div className="flex items-center gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
            <UserRound className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">Profile</h3>
            <p className="crossover-card__subtitle">Your account details and profile photo.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-white/15">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-white/10 text-2xl font-black text-white">
                  {initials(username)}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="admin-btn-secondary flex items-center gap-2"
                disabled={savingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                {savingPhoto ? "Saving…" : avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  className="admin-btn-ghost flex items-center gap-2 text-sm text-red-300"
                  disabled={savingPhoto}
                  onClick={() => void savePhoto(null)}
                >
                  <Trash2 className="h-4 w-4" /> Remove photo
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleFileSelected(event)}
              />
            </div>
          </div>

          <dl className="grid flex-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="admin-label">Email / Username</dt>
              <dd className="mt-1 text-sm font-bold text-white">{username}</dd>
            </div>
            <div>
              <dt className="admin-label">Role</dt>
              <dd className="mt-1 text-sm font-bold text-white">{roleLabel}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="crossover-card p-5">
        <div className="flex items-center gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-[var(--crossover-gold)]">
            <KeyRound className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h3 className="crossover-card__title">Change Password</h3>
            <p className="crossover-card__subtitle">Update your login password for the admin dashboard.</p>
          </div>
        </div>
        <form className="mt-5 grid gap-4 md:max-w-lg" onSubmit={(event) => void changePassword(event)}>
          <label className="grid gap-2">
            <span className="admin-label">New password</span>
            <input type="password" className="crossover-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="grid gap-2">
            <span className="admin-label">Confirm password</span>
            <input type="password" className="crossover-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <div>
            <button type="submit" className="admin-btn-primary" disabled={busy || !password || !confirmPassword}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
