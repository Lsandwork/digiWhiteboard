"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { getTabLabel } from "@/lib/admin/nav-groups";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_TAB_ICONS } from "@/lib/fitdog-dashboard/assets";
import {
  hubDefinitionForTab,
  hubLinkHref,
  hubLinkLabel,
  isSuperAdminHubTab,
  parentHubForTab,
  type SuperAdminHubDefinition,
  type SuperAdminHubLink
} from "@/lib/admin/role-hub-nav";
import { roleCanSeeBlogNav, roleCanSeeRufflyNav } from "@/lib/admin/nav-groups";
import { GINGR_NAV_ICON } from "@/lib/gingr/constants";
import { openGingrSecurely } from "@/lib/gingr/open-gingr";
import { RUFFLY_NAV_ICON } from "@/lib/ruffly/branding/assets";

export function SuperAdminHubPanel({
  hubTab,
  visibleTabs = [],
  role = null,
  email = null,
  name = null,
  marketingAppsOnly = false
}: {
  hubTab: AdminTab;
  onNavigate?: (tab: AdminTab) => void;
  visibleTabs?: AdminTab[];
  role?: string | null;
  email?: string | null;
  name?: string | null;
  marketingAppsOnly?: boolean;
}) {
  if (!isSuperAdminHubTab(hubTab)) return null;
  const hub = hubDefinitionForTab(hubTab, visibleTabs.length ? visibleTabs : [hubTab], {
    includeRuffly: roleCanSeeRufflyNav(role),
    includeBlog: roleCanSeeBlogNav(role, email, name),
    marketingAppsOnly
  });
  if (!hub || !hub.sections.length) {
    return (
      <section className="rounded-2xl border border-admin-border bg-black/20 p-5 text-sm text-admin-muted">
        No tools are available in this hub for your login.
      </section>
    );
  }
  return <HubLauncher hub={hub} />;
}

export function SuperAdminNestedReturnBar({
  tab,
  onNavigate
}: {
  tab: AdminTab;
  onNavigate: (tab: AdminTab) => void;
}) {
  const parent = parentHubForTab(tab);
  if (!parent) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-admin-border bg-black/20 px-3 py-2">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200"
        onClick={() => onNavigate(parent)}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {getTabLabel(parent)}
      </button>
      <span className="text-xs text-admin-muted">·</span>
      <span className="text-xs text-admin-muted">
        Opened from your menu hubs — every tool still works the same.
      </span>
    </div>
  );
}

function HubLauncher({ hub }: { hub: SuperAdminHubDefinition }) {
  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-admin-border bg-gradient-to-br from-[#132033] via-[#101826] to-[#0b1220] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-admin-muted">Menu hub</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">{hub.title}</h2>
        <p className="mt-1 max-w-3xl text-sm text-admin-muted">{hub.description}</p>
      </header>

      {hub.sections.map((section) => (
        <section key={section.id} className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">{section.title}</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {section.links.map((link) => (
              <HubButton key={link.kind === "tab" ? link.tab : link.id} link={link} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function HubAppMark({ link }: { link: SuperAdminHubLink }) {
  if (link.kind === "tab") {
    const iconSrc = FITDOG_TAB_ICONS[link.tab];
    if (iconSrc) {
      return <FitdogDashboardIcon src={iconSrc} size={22} className="mt-0.5 shrink-0" />;
    }
  } else if (link.id === "gingr") {
    return (
      <Image src={GINGR_NAV_ICON} alt="" width={22} height={22} className="mt-0.5 shrink-0 rounded-sm" />
    );
  } else if (link.id === "ruffly") {
    return (
      <Image src={RUFFLY_NAV_ICON} alt="" width={22} height={22} className="mt-0.5 shrink-0 rounded-sm" />
    );
  } else if (link.id === "automatic-blog" || link.id === "social-generator") {
    const isSocial = link.id === "social-generator";
    return (
      <span
        className={`mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold text-white ${
          isSocial ? "bg-sky-700" : "bg-emerald-700"
        }`}
        aria-hidden
      >
        {isSocial ? "S" : "B"}
      </span>
    );
  }

  return (
    <span className="mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-white/10 text-[10px] text-admin-muted">
      App
    </span>
  );
}

function HubButton({ link }: { link: SuperAdminHubLink }) {
  const label = hubLinkLabel(link);
  const href = hubLinkHref(link);
  const isRoute = link.kind === "route";
  const isGingr = isRoute && link.id === "gingr";

  return (
    <Link
      href={href}
      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-white/[0.05]"
      onClick={() => {
        if (isGingr) openGingrSecurely();
      }}
    >
      <span className="flex items-start gap-3">
        <HubAppMark link={link} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-white">
            {label}
            {isRoute ? (
              <ExternalLink className="h-3.5 w-3.5 text-admin-muted" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-admin-muted" />
            )}
          </span>
          <span className="mt-0.5 block text-xs text-admin-muted">{link.description}</span>
        </span>
      </span>
    </Link>
  );
}
