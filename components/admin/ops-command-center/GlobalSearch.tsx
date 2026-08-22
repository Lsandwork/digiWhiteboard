"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { OpsDog } from "@/lib/ops-command-center/types";
import { OpsSidePanel } from "@/components/admin/ops-command-center/SidePanel";
import { OpsDogCard } from "@/components/admin/ops-command-center/DogCard";

type SearchHit = {
  kind: "dog" | "tab";
  id: string;
  title: string;
  subtitle?: string;
  tab?: string;
  dog?: OpsDog;
};

const QUICK_TABS: Array<{ tab: string; label: string; keywords: string }> = [
  { tab: "my_shift", label: "My Shift", keywords: "home dashboard shift" },
  { tab: "ops_command_center", label: "Ops Command Center", keywords: "management live ops" },
  { tab: "front_desk_command", label: "Front Desk Command", keywords: "arriving checkout pickup" },
  { tab: "yard_command", label: "Yard Command", keywords: "walks break body check" },
  { tab: "driver_mode", label: "Driver / Hiker Mode", keywords: "route stop van samsara" },
  { tab: "overnight_command", label: "Overnight Command", keywords: "rounds medication feeding" },
  { tab: "trainer_ops", label: "Trainer Ops", keywords: "session homework training" },
  { tab: "ops_system_health", label: "System Health & Debugging", keywords: "gingr twilio samsara integrations cursor debug route audit errors" },
  { tab: "shift_handoff", label: "Shift Handoff", keywords: "handover overnight morning" },
  { tab: "crossover_communication", label: "Team Log", keywords: "crossover notes" },
  { tab: "walks_board", label: "Walks Board", keywords: "walk overdue whiteboard alarm no plays grooming" },
  { tab: "grooming_push", label: "Grooming Push", keywords: "groomer ready" },
  { tab: "live_fleet", label: "Live Fleet", keywords: "fleet vans gps samsara map" },
  { tab: "route_generator", label: "Route Generator", keywords: "routes vans" },
  { tab: "media_library", label: "Media Library", keywords: "photos videos" },
  { tab: "fitdog_alerts", label: "Fitdog Alerts", keywords: "payment" }
];

export function OpsGlobalSearch({
  onNavigate,
  visibleTabs
}: {
  onNavigate: (tab: string, dogId?: string) => void;
  visibleTabs?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dogs, setDogs] = useState<OpsDog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || !query.trim()) {
      setDogs([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/ops-command-center?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store"
        });
        const body = await readResponseJson(res);
        if (res.ok) setDogs((body.dogs || []) as OpsDog[]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tabHits: SearchHit[] = QUICK_TABS.filter((tab) => {
      if (visibleTabs && !visibleTabs.includes(tab.tab)) return false;
      if (!q) return true;
      return `${tab.label} ${tab.keywords}`.toLowerCase().includes(q);
    }).map((tab) => ({
      kind: "tab",
      id: tab.tab,
      title: tab.label,
      subtitle: "RuffOps screen",
      tab: tab.tab
    }));
    const dogHits: SearchHit[] = dogs.map((dog) => ({
      kind: "dog",
      id: dog.id,
      title: dog.name,
      subtitle: dog.ownerName || dog.gingrAnimalId || "Ops dog profile",
      dog
    }));
    return [...dogHits, ...tabHits].slice(0, 20);
  }, [dogs, query, visibleTabs]);

  return (
    <>
      <button
        type="button"
        className="admin-btn-secondary hidden items-center gap-2 px-2 py-1 text-xs sm:inline-flex"
        onClick={() => setOpen(true)}
        title="Search RuffOps (⌘K / Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" />
        Search
        <kbd className="rounded border border-white/15 px-1 text-[10px] text-admin-muted">⌘K</kbd>
      </button>

      <OpsSidePanel open={open} title="Search RuffOps" onClose={() => setOpen(false)}>
        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
          <input
            autoFocus
            className="admin-input w-full pl-9"
            placeholder="Dog, owner, employee tool, alert…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {loading ? <p className="text-xs text-admin-muted">Searching…</p> : null}
        <ul className="space-y-2">
          {hits.map((hit) =>
            hit.kind === "dog" && hit.dog ? (
              <li key={`dog-${hit.id}`}>
                <OpsDogCard
                  dog={{
                    id: hit.dog.id,
                    name: hit.dog.name,
                    ownerName: hit.dog.ownerName,
                    photoUrl: hit.dog.photoUrl,
                    gingrAnimalId: hit.dog.gingrAnimalId
                  }}
                  onOpen={(id) => {
                    setOpen(false);
                    onNavigate("my_shift", id);
                  }}
                />
              </li>
            ) : (
              <li key={`tab-${hit.id}`}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-sky-400/40"
                  onClick={() => {
                    setOpen(false);
                    if (hit.tab) onNavigate(hit.tab);
                  }}
                >
                  <p className="text-sm font-medium text-white">{hit.title}</p>
                  <p className="text-xs text-admin-muted">{hit.subtitle}</p>
                </button>
              </li>
            )
          )}
        </ul>
        {!hits.length ? (
          <p className="mt-4 text-sm text-admin-muted">
            No matches. Try a dog name, Gingr animal ID, or screen name.
          </p>
        ) : null}
      </OpsSidePanel>
    </>
  );
}
