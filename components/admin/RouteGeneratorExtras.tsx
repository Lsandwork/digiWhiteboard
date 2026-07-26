"use client";

import { useEffect, useMemo, useState } from "react";
import type { SkippedOccurrence } from "@/lib/route-generator/fitdog-api";
import type { GingrTaxiServiceRow } from "@/lib/route-generator/gingr-taxi";

const VAN_OPTIONS = [
  { value: "van_5", label: "Van 5 (Club · taxi/group/training)" },
  { value: "van_6", label: "Van 6 (Club · taxi/group/training)" },
  { value: "van_1", label: "Van 1 (Kenneth Hahn)" },
  { value: "van_2", label: "Van 2 (Kenneth Hahn)" },
  { value: "van_3", label: "Van 3 (Beach M/W/F · Hahn T/Th)" }
];

type Props = {
  date: string;
  reportRunId: string | null;
  skippedOccurrences: SkippedOccurrence[];
  busy?: boolean;
  onAssignSkipped: (occurrenceId: number, vanKey: string) => Promise<void>;
  onAddManualTaxi: (payload: {
    dogName: string;
    ownerName: string;
    address: string;
    city: string;
    zip: string;
    phone: string;
    notes: string;
    vanKey: string;
  }) => Promise<void>;
  onAddGingrTaxi: (row: GingrTaxiServiceRow, vanKey: string) => Promise<void>;
};

export function RouteGeneratorExtras({
  date,
  reportRunId,
  skippedOccurrences,
  busy,
  onAssignSkipped,
  onAddManualTaxi,
  onAddGingrTaxi
}: Props) {
  const [vanByOccurrence, setVanByOccurrence] = useState<Record<number, string>>({});
  const [gingrTaxi, setGingrTaxi] = useState<GingrTaxiServiceRow[]>([]);
  const [gingrError, setGingrError] = useState<string | null>(null);
  const [gingrConfigured, setGingrConfigured] = useState(true);
  const [gingrVan, setGingrVan] = useState("van_5");
  const [selectedGingrId, setSelectedGingrId] = useState("");
  const [taxiForm, setTaxiForm] = useState({
    dogName: "",
    ownerName: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    notes: "",
    vanKey: "van_5"
  });

  useEffect(() => {
    let cancelled = false;
    async function loadGingr() {
      try {
        const response = await fetch(
          `/api/admin/route-generator?view=gingr_taxi&date=${encodeURIComponent(date)}`,
          { cache: "no-store" }
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load Gingr taxi services.");
        if (cancelled) return;
        setGingrConfigured(Boolean(body.configured));
        setGingrTaxi(Array.isArray(body.services) ? body.services : []);
        setGingrError(body.error || null);
      } catch (error) {
        if (!cancelled) {
          setGingrTaxi([]);
          setGingrError(error instanceof Error ? error.message : "Unable to load Gingr taxi services.");
        }
      }
    }
    void loadGingr();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const pendingSkipped = useMemo(
    () => skippedOccurrences.filter((row) => !row.assignedVanKey),
    [skippedOccurrences]
  );
  const assignedSkipped = useMemo(
    () => skippedOccurrences.filter((row) => row.assignedVanKey),
    [skippedOccurrences]
  );

  return (
    <div className="space-y-4">
      <section className="admin-card overflow-hidden p-0">
        <div className="border-b border-admin-border px-4 py-3">
          <h3 className="text-base font-semibold text-white">Skipped non-route class occurrences</h3>
          <p className="text-xs text-admin-muted">
            Classes that are not Beach / Adventure / Trainer / Group / Taxi. Assign them to a van route to include
            those dogs on Generate Routes.
          </p>
        </div>
        {!skippedOccurrences.length ? (
          <p className="px-4 py-6 text-sm text-admin-muted">No skipped class occurrences on the latest pull.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-wide text-admin-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Class</th>
                  <th className="px-4 py-2 font-semibold">Dogs</th>
                  <th className="px-4 py-2 font-semibold">Pickup window</th>
                  <th className="px-4 py-2 font-semibold">Drop-off window</th>
                  <th className="px-4 py-2 font-semibold">Assign to route</th>
                </tr>
              </thead>
              <tbody>
                {skippedOccurrences.map((row) => {
                  const selectedVan = vanByOccurrence[row.occurrenceId] || "van_5";
                  const assigned = Boolean(row.assignedVanKey);
                  return (
                    <tr key={row.occurrenceId} className="border-t border-admin-border/70 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{row.className}</div>
                        <div className="text-xs text-admin-muted">Occurrence #{row.occurrenceId}</div>
                      </td>
                      <td className="px-4 py-3 text-admin-muted">
                        <div className="text-white">{row.dogCount} dog(s)</div>
                        <div className="mt-1 max-w-xs text-xs">
                          {row.dogs
                            .slice(0, 6)
                            .map((dog) => dog.dogName || "Dog")
                            .join(", ")}
                          {row.dogs.length > 6 ? ` +${row.dogs.length - 6} more` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-admin-muted">
                        {[row.pickupWindowStart, row.pickupWindowEnd].filter(Boolean).join(" – ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-admin-muted">
                        {[row.dropoffWindowStart, row.dropoffWindowEnd].filter(Boolean).join(" – ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {assigned ? (
                          <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                            Assigned to {String(row.assignedVanKey).replace("van_", "Van ")}
                            {row.assignedService ? ` · ${row.assignedService}` : ""}
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="admin-input min-w-[11rem]"
                              value={selectedVan}
                              disabled={!reportRunId || busy}
                              onChange={(event) =>
                                setVanByOccurrence((prev) => ({
                                  ...prev,
                                  [row.occurrenceId]: event.target.value
                                }))
                              }
                            >
                              {VAN_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="admin-btn-primary"
                              disabled={!reportRunId || busy}
                              onClick={() => void onAssignSkipped(row.occurrenceId, selectedVan)}
                            >
                              Assign
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pendingSkipped.length || assignedSkipped.length ? (
          <div className="border-t border-admin-border px-4 py-2 text-xs text-admin-muted">
            {pendingSkipped.length} pending · {assignedSkipped.length} assigned
          </div>
        ) : null}
      </section>

      <section className="admin-card space-y-4 p-4">
        <div>
          <h3 className="text-base font-semibold text-white">Additional services · Taxi</h3>
          <p className="text-xs text-admin-muted">
            Add Taxi Service for {date}. Pull Gingr taxi reservations by date, or enter a taxi manually.
          </p>
        </div>

        <div className="rounded-xl border border-admin-border/80 bg-black/20 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Gingr taxi services by date</h4>
            <select
              className="admin-input"
              value={gingrVan}
              disabled={busy}
              onChange={(event) => setGingrVan(event.target.value)}
            >
              {VAN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {!gingrConfigured ? (
            <p className="text-sm text-amber-200">GINGR_API_KEY is not configured — use manual taxi entry below.</p>
          ) : gingrError ? (
            <p className="text-sm text-amber-200">{gingrError}</p>
          ) : !gingrTaxi.length ? (
            <p className="text-sm text-admin-muted">No Gingr taxi-like reservations found for this date.</p>
          ) : (
            <div className="space-y-2">
              <select
                className="admin-input w-full"
                value={selectedGingrId}
                onChange={(event) => setSelectedGingrId(event.target.value)}
              >
                <option value="">Select a Gingr taxi reservation…</option>
                {gingrTaxi.map((row) => (
                  <option key={row.reservationId} value={row.reservationId}>
                    {(row.dogName || "Dog") +
                      (row.ownerName ? ` · ${row.ownerName}` : "") +
                      (row.address ? ` · ${row.address}` : "")}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="admin-btn-primary"
                disabled={!reportRunId || busy || !selectedGingrId}
                onClick={() => {
                  const row = gingrTaxi.find((item) => item.reservationId === selectedGingrId);
                  if (row) void onAddGingrTaxi(row, gingrVan);
                }}
              >
                Add selected Gingr Taxi
              </button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-admin-border/80 bg-black/20 p-3">
          <h4 className="mb-2 text-sm font-semibold text-white">Manual Taxi entry</h4>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block text-xs text-admin-muted">
              Dog name
              <input
                className="admin-input mt-1"
                value={taxiForm.dogName}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, dogName: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted">
              Owner name
              <input
                className="admin-input mt-1"
                value={taxiForm.ownerName}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, ownerName: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted md:col-span-2">
              Address
              <input
                className="admin-input mt-1"
                value={taxiForm.address}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted">
              City
              <input
                className="admin-input mt-1"
                value={taxiForm.city}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted">
              ZIP
              <input
                className="admin-input mt-1"
                value={taxiForm.zip}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, zip: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted">
              Phone
              <input
                className="admin-input mt-1"
                value={taxiForm.phone}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </label>
            <label className="block text-xs text-admin-muted">
              Assign to route
              <select
                className="admin-input mt-1"
                value={taxiForm.vanKey}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, vanKey: event.target.value }))}
              >
                {VAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-admin-muted md:col-span-2">
              Notes
              <input
                className="admin-input mt-1"
                value={taxiForm.notes}
                onChange={(event) => setTaxiForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="admin-btn-primary mt-3"
            disabled={!reportRunId || busy}
            onClick={() => void onAddManualTaxi(taxiForm)}
          >
            Add Taxi Service
          </button>
        </div>
      </section>
    </div>
  );
}
