"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { accessFromLegacyRole, firstAccessibleAdminTab, isMarketingLegacyRole, isStaffDigiBoardOnlyLegacyRole } from "@/lib/admin/permissions";
import type { AdminTab } from "@/lib/admin/types";
import "@/app/login-screen.css";

const REMEMBER_USERNAME_KEY = "fitdog.login.rememberUsername";
const HELP_EMAIL = "Lonnie@fitdog.com";

function defaultAdminRoute(role?: string, isDemo?: boolean) {
  if (isDemo) return "/admin?board=staff&tab=demo_push";
  const access = accessFromLegacyRole(null, null, role);
  const board = isStaffDigiBoardOnlyLegacyRole(role)
    ? "staff"
    : isMarketingLegacyRole(role)
      ? "lobby"
      : "lobby";
  const tab = firstAccessibleAdminTab(access, role, board) as AdminTab;
  const resolvedBoard = board === "staff" && tab === "users" ? "lobby" : board;
  return `/admin?board=${resolvedBoard}&tab=${tab}`;
}

const FEATURES = [
  {
    title: "Real-time Updates",
    text: "See everything as it happens.",
    icon: "/assets/login/login-update-icon.svg"
  },
  {
    title: "Instant Alerts",
    text: "Important notices delivered fast.",
    icon: "/assets/login/login-alert-icon.svg"
  },
  {
    title: "Team Connected",
    text: "One board. Everyone aligned.",
    icon: "/assets/login/login-team-icon.svg"
  }
] as const;

export function AdminLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberMe(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (cancelled) return;
        if (body.mustChangePassword && body.adminUserId) {
          setMustChangePassword(true);
          setAdminUserId(body.adminUserId);
          if (body.username) setUsername(body.username);
        }
      } catch {
        // ignore
      }
    }
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!username.trim() || !password) {
      setError("Enter your username and password to continue.");
      return;
    }

    setBusy(true);
    setError(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Invalid username or password.");

      try {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim());
        } else {
          window.localStorage.removeItem(REMEMBER_USERNAME_KEY);
        }
      } catch {
        // ignore storage errors
      }

      if (body.forcePasswordChange && body.adminUserId) {
        setMustChangePassword(true);
        setAdminUserId(body.adminUserId);
        return;
      }

      const next = searchParams.get("next") || defaultAdminRoute(body.role, body.isDemo);
      router.replace(next);
      router.refresh();
    } catch (loginError) {
      const aborted = loginError instanceof DOMException && loginError.name === "AbortError";
      setError(
        aborted
          ? "Sign-in is taking longer than usual. Check your connection and try again."
          : loginError instanceof Error
            ? loginError.message
            : "Invalid username or password."
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    if (!adminUserId || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/change-own-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: newPassword,
          confirm_password: confirmPassword
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update password.");

      const next = searchParams.get("next") || defaultAdminRoute(body.role);
      router.replace(next);
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Unable to update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-screen__theme">
        <ThemeToggle />
      </div>

      <section className="login-screen__brand-panel" aria-label="Fitdog Digi-Board branding">
        <Image
          src="/assets/login/paw-decoration.svg"
          alt=""
          width={40}
          height={40}
          aria-hidden
          className="login-screen__paw login-screen__paw--1"
        />
        <Image
          src="/assets/login/paw-decoration.svg"
          alt=""
          width={32}
          height={32}
          aria-hidden
          className="login-screen__paw login-screen__paw--2"
        />
        <Image
          src="/assets/login/paw-decoration.svg"
          alt=""
          width={28}
          height={28}
          aria-hidden
          className="login-screen__paw login-screen__paw--3"
        />

        <div className="login-screen__brand-mark">
          <Image src="/assets/login/fitdog-logo.png" alt="Fitdog" width={52} height={52} priority />
          <div className="login-screen__brand-text">
            <span className="login-screen__brand-fitdog">Fitdog</span>
            <span className="login-screen__brand-digiboard">Digi-Board</span>
          </div>
        </div>

        <div className="login-screen__copy">
          <h1 className="login-screen__headline">
            <span className="login-screen__headline-navy">Every update.</span>
            <span className="login-screen__headline-orange">
              All in one place.
              <Image
                src="/assets/login/orange-underline.svg"
                alt=""
                width={220}
                height={14}
                aria-hidden
                className="login-screen__underline"
              />
            </span>
          </h1>
          <p className="login-screen__support">
            Manage your digital whiteboards, notifications, and team updates — simple, fast, and connected.
          </p>
        </div>

        <div className="login-screen__visual">
          <div className="login-screen__dogs-wrap">
            <Image
              src="/assets/login/fitdog-login-dogs.webp"
              alt="Two Fitdog dogs sitting outdoors"
              fill
              priority
              sizes="(max-width: 860px) 100vw, 48vw"
              className="login-screen__dogs"
            />
          </div>

          <div className="login-screen__features" aria-label="Digi-Board highlights">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="login-screen__feature">
                <span className="login-screen__feature-icon">
                  <Image src={feature.icon} alt="" width={18} height={18} aria-hidden />
                </span>
                <h2 className="login-screen__feature-title">{feature.title}</h2>
                <p className="login-screen__feature-text">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="login-screen__form-panel">
        <form
          className="login-screen__card"
          onSubmit={mustChangePassword ? submitPasswordChange : submit}
          noValidate
        >
          <header className="login-screen__card-header">
            <Image src="/assets/login/fitdog-logo.png" alt="Fitdog" width={56} height={56} priority />
            <h2 className="login-screen__card-title">{mustChangePassword ? "Set New Password" : "Welcome Back!"}</h2>
            <span className="login-screen__card-divider" aria-hidden />
            <p className="login-screen__card-subtitle">
              {mustChangePassword
                ? "Your temporary password must be changed before you can continue."
                : "Sign in to your Digi-Board account to get started."}
            </p>
          </header>

          {mustChangePassword ? (
            <>
              <div className="login-screen__field">
                <label className="login-screen__label" htmlFor="new-password">
                  New password
                </label>
                <div className="login-screen__input-wrap">
                  <Lock className="login-screen__input-icon" aria-hidden />
                  <input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="login-screen__input"
                    autoComplete="new-password"
                    required
                    disabled={busy}
                  />
                </div>
              </div>
              <div className="login-screen__field">
                <label className="login-screen__label" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <div className="login-screen__input-wrap">
                  <Lock className="login-screen__input-icon" aria-hidden />
                  <input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="login-screen__input"
                    autoComplete="new-password"
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="login-screen__toggle-password"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="login-screen__field">
                <label className="login-screen__label" htmlFor="username">
                  Username
                </label>
                <div className="login-screen__input-wrap">
                  <UserRound className="login-screen__input-icon" aria-hidden />
                  <input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="login-screen__input"
                    placeholder="Enter your username"
                    autoComplete="username"
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="login-screen__field">
                <label className="login-screen__label" htmlFor="password">
                  Password
                </label>
                <div className="login-screen__input-wrap">
                  <Lock className="login-screen__input-icon" aria-hidden />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="login-screen__input"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="login-screen__toggle-password"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="login-screen__options">
                <label className="login-screen__remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={busy}
                  />
                  Remember me
                </label>
                <a
                  className="login-screen__forgot"
                  href={`mailto:${HELP_EMAIL}?subject=${encodeURIComponent("Digi-Board password help")}`}
                >
                  Forgot password?
                </a>
              </div>
            </>
          )}

          {error ? (
            <p className="login-screen__error" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-screen__submit" disabled={busy}>
            {busy
              ? mustChangePassword
                ? "Updating..."
                : "Signing in..."
              : mustChangePassword
                ? "Update Password"
                : "Sign In"}
            {!busy && !mustChangePassword ? <ArrowRight size={18} aria-hidden /> : null}
          </button>

          {mustChangePassword ? (
            <p className="login-screen__password-hint">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--login-orange)]" aria-hidden />
              Temporary passwords must be replaced before dashboard access is granted.
            </p>
          ) : (
            <p className="login-screen__help">
              Need help? Email{" "}
              <a className="login-screen__help-link" href={`mailto:${HELP_EMAIL}`}>
                {HELP_EMAIL}
              </a>
            </p>
          )}
        </form>

        <div className="login-screen__mobile-visual">
          <Image
            src="/assets/login/fitdog-login-dogs.webp"
            alt="Two Fitdog dogs sitting outdoors"
            width={942}
            height={584}
            className="login-screen__mobile-dogs"
            sizes="100vw"
          />
          <div className="login-screen__mobile-features">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="login-screen__mobile-feature">
                <span className="login-screen__feature-icon">
                  <Image src={feature.icon} alt="" width={16} height={16} aria-hidden />
                </span>
                <div>
                  <p className="login-screen__feature-title">{feature.title}</p>
                  <p className="login-screen__feature-text">{feature.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
