"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { getTabLabel } from "@/lib/admin/nav-groups";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_TAB_ICONS } from "@/lib/fitdog-dashboard/assets";
import {
  hubDefinitionForTab,
  hubLinkLabel,
  isSuperAdminHubTab,
  parentHubForTab,
  type SuperAdminHubDefinition,
  type SuperAdminHubLink
} from "@/lib/admin/role-hub-nav";
import { roleCanSeeBlogNav, roleCanSeeRufflyNav } from "@/lib/admin/nav-groups";

export function SuperAdminHubPanel({
  hubTab,
  onNavigate,
  visibleTabs = [],
  role = null
}: {
  hubTab: AdminTab;
  onNavigate: (tab: AdminTab) => void;
  visibleTabs?: AdminTab[];
  role?: string | null;
}) {
  if (!isSuperAdminHubTab(hubTab)) return null;
  const hub = hubDefinitionForTab(hubTab, visibleTabs.length ? visibleTabs : [hubTab], {
    includeRuffly: roleCanSeeRufflyNav(role),
    includeBlog: roleCanSeeBlogNav(role)
  });
  if (!hub || !hub.sections.length) {
    return (
      <section className="rounded-2xl border border-admin-border bg-black/20 p-5 text-sm text-admin-muted">
        No tools are available in this hub for your login.
      </section>
    );
  }
  return <HubLauncher hub={hub} onNavigate={onNavigate} />;
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

function HubLauncher({
  hub,
  onNavigate
}: {
  hub: SuperAdminHubDefinition;
  onNavigate: (tab: AdminTab) => void;
}) {
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
              <HubButton key={link.kind === "tab" ? link.tab : link.id} link={link} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function HubButton({
  link,
  onNavigate
}: {
  link: SuperAdminHubLink;
  onNavigate: (tab: AdminTab) => void;
}) {
  const label = hubLinkLabel(link);
  const iconSrc = link.kind === "tab" ? FITDOG_TAB_ICONS[link.tab] : undefined;

  const inner = (
    <span className="flex items-start gap-3">
      {iconSrc ? (
        <FitdogDashboardIcon src={iconSrc} size={22} className="mt-0.5 shrink-0" />
      ) : (
        <span className="mt-0.5 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-white/10 text-[10px] text-admin-muted">
          App
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-white">
          {label}
          {link.kind === "route" ? (
            <ExternalLink className="h-3.5 w-3.5 text-admin-muted" />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5 text-admin-muted" />
          )}
        </span>
        <span className="mt-0.5 block text-xs text-admin-muted">{link.description}</span>
      </span>
    </span>
  );

  if (link.kind === "route") {
    return (
      <Link
        href={link.href}
        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-white/[0.05]"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/40 hover:bg-white/[0.05]"
      onClick={() => onNavigate(link.tab)}
    >
      {inner}
    </button>
  );
}
