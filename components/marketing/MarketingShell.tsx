"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, X } from "lucide-react";
import { MARKETING_NAV, MARKETING_QUICK_ACTIONS } from "@/lib/marketing/nav";
import { MARKETING_ROUTES } from "@/lib/marketing/constants";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { getAdminSidebarRoleLabel } from "@/lib/admin/users";

type MarketingShellProps = {
  children: React.ReactNode;
};

export function MarketingShell({ children }: MarketingShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const title = useMemo(
    () => MARKETING_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "Marketing Dashboard",
    [pathname]
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [session, setSession] = useState<{ email: string; role: string | null; unreadNotifications: number } | null>(null);

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/marketing/session", { cache: "no-store" });
    if (!response.ok) {
      router.replace(`/admin/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const body = await response.json();
    setSession({
      email: body.email,
      role: body.role,
      unreadNotifications: body.unreadNotifications ?? 0
    });
  }, [pathname, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSession(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSession]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  const displayName = session?.email?.split("@")[0]?.replace(/[._]/g, " ") ?? "Marketing";

  return (
    <div className={`marketing-app ${collapsed ? "marketing-app--collapsed" : ""}`}>
      <aside className={`marketing-sidebar ${mobileOpen ? "marketing-sidebar--open" : ""}`}>
        <div className="marketing-sidebar__brand">
          <Image src="/assets/fitdog/fitdog-logo-white.svg" alt="Fitdog" width={120} height={32} />
          <p className="marketing-sidebar__subtitle">Digital Whiteboard</p>
        </div>
        <nav className="marketing-sidebar__nav" aria-label="Marketing navigation">
          {MARKETING_NAV.map((item) => {
            const active = pathname === item.href || (item.href !== MARKETING_ROUTES.dashboard && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`marketing-nav-item ${active ? "marketing-nav-item--active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <FitdogDashboardIcon src={item.icon} size={18} className="marketing-nav-item__icon" />
                <span>{item.label}</span>
                {item.key === "notifications" && (session?.unreadNotifications ?? 0) > 0 ? (
                  <span className="marketing-nav-item__badge">{session?.unreadNotifications}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="marketing-sidebar__quick">
          <p className="marketing-sidebar__section-label">Quick Actions</p>
          {MARKETING_QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} className="marketing-quick-action" onClick={() => setMobileOpen(false)}>
              <strong>{action.label}</strong>
              <span>{action.description}</span>
            </Link>
          ))}
        </div>
        <button type="button" className="marketing-sidebar__collapse" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          <span>Collapse Menu</span>
        </button>
      </aside>

      <div className="marketing-main">
        <header className="marketing-header">
          <div className="marketing-header__left">
            <button type="button" className="marketing-header__menu" onClick={() => setMobileOpen((v) => !v)} aria-label="Toggle menu">
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1>{title}</h1>
          </div>
          <div className="marketing-header__right">
            <Link href={MARKETING_ROUTES.notifications} className="marketing-header__bell" aria-label="Notifications">
              <Bell size={18} />
              {(session?.unreadNotifications ?? 0) > 0 ? (
                <span className="marketing-header__bell-badge">{session?.unreadNotifications}</span>
              ) : null}
            </Link>
            <div className="marketing-header__user">
              <div className="marketing-header__avatar" aria-hidden>
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="marketing-header__name">{displayName}</p>
                <p className="marketing-header__role">{getAdminSidebarRoleLabel(session?.role, session?.email)}</p>
              </div>
            </div>
            <button type="button" className="marketing-header__logout" onClick={() => void logout()} aria-label="Log out">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="marketing-content">{children}</main>
      </div>
    </div>
  );
}
