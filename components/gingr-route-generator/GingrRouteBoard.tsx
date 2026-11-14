"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Search, Truck } from "lucide-react";
import { dogHasSportSignUp } from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import {
  dogMatchesActivityFilter,
  type GingrActivityFilter
} from "@/lib/gingr-route-generator/subject-groups";
import type { GingrRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";

type LegFilter = "all" | "pickup" | "dropoff" | "owner" | "notes";
type BoardView = "board" | "vans";

const SERVICE_FILTERS: Array<{ id: GingrActivityFilter; label: string }> = [
  { id: "all", label: "All services" },
  { id: "class", label: "Group class" },
  { id: "sport", label: "Sports Sign Ups" },
  { id: "stay_and_play", label: "Stay and Play" },
  { id: "half_day", label: "Half-day" },
  { id: "full_day", label: "Full-day" },
  { id: "overnight", label: "Overnight" },
  { id: "taxi", label: "Taxi" }
];

const LEG_FILTERS: Array<{ id: LegFilter; label: string }> = [
  { id: "all", label: "Every dog" },
  { id: "pickup", label: "Home pickup" },
  { id: "dropoff", label: "Home drop-off" },
  { id: "owner", label: "Owner handoff" },
  { id: "notes", label: "Has instructions" }
];

const VANS: Array<{ id: GingrRouteVanKey; label: string }> = [
  { id: "van_1", label: "Van 1 · outing" },
  { id: "van_2", label: "Van 2 · outing" },
  { id: "van_3", label: "Van 3 · outing" },
  { id: "van_5", label: "Van 5 · club, class, and taxi" },
  { id: "van_6", label: "Van 6 · club, class, and taxi" }
];

function vanName(key: GingrRouteDog["routeVanKey"]): string {
  return key.replace("van_", "Van ");
}

function bookedAs(dog: GingrRouteDog): string {
  const labels = dog.activityLabels.filter((label) => label !== "Club" && label !== "Taxi");
  const activity = labels.join(", ");
  const visit = dog.visitLabel;
  if (dogHasSportSignUp(dog.activities) && !dog.activities.includes("sport_sign_ups")) {
    const sport = activity || "Sports Sign Ups";
    return visit ? `Sports Sign Ups · ${sport} · ${visit}` : `Sports Sign Ups · ${sport}`;
  }
  if (activity && visit) return `${activity} · ${visit}`;
  if (activity) return activity;
  if (visit && dog.isTaxi) return `${visit} · Taxi`;
  if (visit) return visit;
  if (dog.isTaxi) return "Taxi Service";
  return "Scheduled";
}

function pickupCell(dog: GingrRouteDog): string {
  if (dog.pickup && dog.pickupDestination === "home") {
    const time = dog.scheduledTimeLabel ? ` · ${dog.scheduledTimeLabel}` : "";
    return `${vanName(dog.routeVanKey)}${time} · Home`;
  }
  if (dog.ownerClubDropoff) return "Owner brings";
  if (dog.alreadyOnProperty || dog.startLocation === "club") return "Already at club";
  return "—";
}

function dropoffCell(dog: GingrRouteDog): string {
  if (dog.dropoff && dog.dropoffDestination === "home") {
    const time = !dog.pickup && dog.scheduledTimeLabel ? ` · ${dog.scheduledTimeLabel}` : "";
    return `${vanName(dog.routeVanKey)}${time} · Home`;
  }
  if (dog.ownerClubPickup) return dog.pickup && !dog.dropoff ? "Stays at club" : "Owner collects";
  if (dog.endLocation === "club" || dog.alreadyOnProperty) return "Stays at club";
  return "—";
}

function instructionText(dog: GingrRouteDog): string | null {
  return dog.dropoffInstructions || dog.pickupInstructions || dog.notes;
}

function preview(text: string | null): string {
  if (!text) return "None on file";
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

function matchesLeg(dog: GingrRouteDog, leg: LegFilter): boolean {
  if (leg === "all") return true;
  if (leg === "pickup") return dog.pickup && dog.pickupDestination === "home";
  if (leg === "dropoff") return dog.dropoff && dog.dropoffDestination === "home";
  if (leg === "owner") return dog.ownerClubDropoff || dog.ownerClubPickup;
  return Boolean(instructionText(dog));
}

export function GingrRouteBoard({
  dogs,
  loading
}: {
  dogs: GingrRouteDog[];
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [service, setService] = useState<GingrActivityFilter>("all");
  const [leg, setLeg] = useState<LegFilter>("all");
  const [view, setView] = useState<BoardView>("board");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dogs.filter((dog) => {
      if (!dogMatchesActivityFilter(dog, service)) return false;
      if (!matchesLeg(dog, leg)) return false;
      if (!q) return true;
      return [dog.name, dog.owner, dog.ownerFullName, dog.homeAddress, bookedAs(dog), instructionText(dog)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [dogs, leg, query, service]);

  const openDog = dogs.find((dog) => dog.id === openId) ?? null;
  const homePickups = filtered.filter((dog) => dog.pickup && dog.pickupDestination === "home").length;
  const homeDropoffs = filtered.filter((dog) => dog.dropoff && dog.dropoffDestination === "home").length;
  const withNotes = filtered.filter((dog) => instructionText(dog)).length;
  const missingAddress = filtered.filter(
    (dog) => (dog.pickup || dog.dropoff) && dog.addressStatus !== "ok"
  );

  return (
    <div className="grg-print-root">
      <section className="grg-stats" aria-label="Schedule statistics">
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loading && !dogs.length ? "—" : filtered.length}</div>
          <div className="grg-stat-label">Dogs</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loading && !dogs.length ? "—" : homePickups}</div>
          <div className="grg-stat-label">Home pickups</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loading && !dogs.length ? "—" : homeDropoffs}</div>
          <div className="grg-stat-label">Home drop-offs</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loading && !dogs.length ? "—" : withNotes}</div>
          <div className="grg-stat-label">Instructions</div>
        </div>
      </section>

      <div className="grg-filters">
        <label className="grg-search">
          <Search size={15} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dog, owner, address, instruction"
            aria-label="Search dogs, owners, addresses, or instructions"
          />
        </label>
        <div className="grg-view-switch" role="tablist" aria-label="Route view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "board"}
            className={`grg-chip ${view === "board" ? "is-active" : ""}`}
            onClick={() => setView("board")}
          >
            Day board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "vans"}
            className={`grg-chip ${view === "vans" ? "is-active" : ""}`}
            onClick={() => setView("vans")}
          >
            Van sheets
          </button>
        </div>
      </div>

      <div className="grg-chips" role="tablist" aria-label="Service">
        {SERVICE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`grg-chip ${service === item.id ? "is-active" : ""}`}
            aria-selected={service === item.id}
            onClick={() => setService(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grg-chips" role="tablist" aria-label="Transportation">
        {LEG_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`grg-chip ${leg === item.id ? "is-active" : ""}`}
            aria-selected={leg === item.id}
            onClick={() => setLeg(item.id)}
          >
            {item.id === "pickup" ? <Truck size={13} aria-hidden /> : null}
            {item.id === "dropoff" ? <MapPin size={13} aria-hidden /> : null}
            {item.label}
          </button>
        ))}
      </div>

      {view === "board" ? (
        <div className="grg-board-scroll">
          {loading && !dogs.length ? <div className="grg-empty"><h3>Loading schedule</h3></div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="grg-empty">
              <h3>No dogs for this filter</h3>
              <p>Try every service, or pick another date.</p>
            </div>
          ) : null}
          {filtered.length ? (
            <table className="grg-board">
              <caption className="grg-board-caption">
                One row per dog. Home means a van stop. Owner bring and owner collect stay off the van.
              </caption>
              <thead>
                <tr>
                  <th>Dog</th>
                  <th>Booked as</th>
                  <th>Pickup</th>
                  <th>Drop-off</th>
                  <th>Drop-off instructions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dog) => {
                  const note = instructionText(dog);
                  return (
                    <tr key={dog.id} className={note ? "has-instructions" : undefined}>
                      <td>
                        <div className="grg-dog-name">{dog.name}</div>
                        <div className="grg-dog-owner">
                          {dog.ownerFullName || dog.owner}
                          {dog.ownerPhone ? ` · ${dog.ownerPhone}` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="grg-booked">{bookedAs(dog)}</div>
                        {dog.homeAddress ? <div className="grg-dog-owner">{dog.homeAddress}</div> : null}
                      </td>
                      <td>{pickupCell(dog)}</td>
                      <td>{dropoffCell(dog)}</td>
                      <td>
                        {note ? (
                          <button type="button" className="grg-note-btn" onClick={() => setOpenId(dog.id)}>
                            <span>{preview(dog.dropoffInstructions || dog.pickupInstructions || dog.notes)}</span>
                            <strong>{openId === dog.id ? "Reading" : "Open"}</strong>
                          </button>
                        ) : (
                          <span className="grg-note-empty">None on file</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : (
        <VanSheets dogs={filtered} openId={openId} onOpen={setOpenId} />
      )}

      {missingAddress.length ? (
        <p className="grg-export-warning">Address missing: {missingAddress.map((dog) => dog.name).join(", ")}</p>
      ) : null}

      {openDog ? <InstructionDialog dog={openDog} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function VanSheets({
  dogs,
  openId,
  onOpen
}: {
  dogs: GingrRouteDog[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const groups = VANS.map((van) => {
    const onVan = dogs.filter((dog) => dog.routeVanKey === van.id);
    const pickups = onVan
      .filter((dog) => dog.pickup && dog.pickupDestination === "home")
      .sort(byTime);
    const dropoffs = onVan
      .filter((dog) => dog.dropoff && dog.dropoffDestination === "home")
      .sort(byTime);
    return { ...van, pickups, dropoffs };
  }).filter((group) => group.pickups.length || group.dropoffs.length);

  if (!groups.length) {
    return (
      <div className="grg-empty">
        <h3>No home van stops for this filter</h3>
        <p>Owner handoffs stay on the day board.</p>
      </div>
    );
  }

  return (
    <div className="grg-van-sheets">
      {groups.map((group) => (
        <section key={group.id} className="grg-van-sheet">
          <h2>{group.label}</h2>
          <RunTable title="Home pickup run" dogs={group.pickups} openId={openId} onOpen={onOpen} />
          <RunTable title="Home drop-off run" dogs={group.dropoffs} openId={openId} onOpen={onOpen} />
        </section>
      ))}
    </div>
  );
}

function RunTable({
  title,
  dogs,
  openId,
  onOpen
}: {
  title: string;
  dogs: GingrRouteDog[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grg-run">
      <h3>
        {title} · {dogs.length}
      </h3>
      {dogs.length ? (
        <table className="grg-board grg-board--stops">
          <thead>
            <tr>
              <th>Stop</th>
              <th>Time</th>
              <th>Dog</th>
              <th>Address</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {dogs.map((dog, index) => (
              <tr key={`${title}-${dog.id}`}>
                <td>{index + 1}</td>
                <td>{dog.scheduledTimeLabel || "—"}</td>
                <td>
                  <div className="grg-dog-name">{dog.name}</div>
                  <div className="grg-dog-owner">{bookedAs(dog)}</div>
                </td>
                <td>{dog.homeAddress || "Address required"}</td>
                <td>
                  {instructionText(dog) ? (
                    <button type="button" className="grg-note-btn" onClick={() => onOpen(dog.id)}>
                      <span>{preview(dog.dropoffInstructions || dog.pickupInstructions || dog.notes)}</span>
                      <strong>{openId === dog.id ? "Reading" : "Open"}</strong>
                    </button>
                  ) : (
                    <span className="grg-note-empty">None on file</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="grg-run-empty">No home stops on this run.</p>
      )}
    </div>
  );
}

function byTime(a: GingrRouteDog, b: GingrRouteDog): number {
  const ta = a.scheduledTime || "99";
  const tb = b.scheduledTime || "99";
  if (ta !== tb) return ta.localeCompare(tb);
  return a.name.localeCompare(b.name);
}

function InstructionDialog({ dog, onClose }: { dog: GingrRouteDog; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const same =
    Boolean(dog.dropoffInstructions) &&
    Boolean(dog.pickupInstructions) &&
    dog.dropoffInstructions === dog.pickupInstructions;
  const dropoff = dog.dropoffInstructions || (!dog.pickupInstructions ? dog.notes : null);
  const pickup = same ? null : dog.pickupInstructions;

  if (!mounted) return null;

  return createPortal(
    <div className="grg-sheet-backdrop" onClick={onClose}>
      <div
        className="grg-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grg-instruction-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="grg-sheet-head">
          <div>
            <p className="grg-sheet-kicker">Drop-off Instructions</p>
            <h2 id="grg-instruction-title">
              {dog.name} · {dog.ownerFullName || dog.owner}
            </h2>
          </div>
          <button type="button" className="grg-sheet-close" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="grg-sheet-meta">{bookedAs(dog)}</p>
        <div className="grg-sheet-grid">
          <section>
            <h3>Drop-off Instructions</h3>
            <p className="grg-sheet-copy">{dropoff || "None on file"}</p>
          </section>
          <section>
            <h3>Pickup Instructions</h3>
            <p className="grg-sheet-copy">
              {same ? "Same text as Drop-off Instructions." : pickup || "None on file"}
            </p>
          </section>
        </div>
        {dog.notes && dog.notes !== dropoff && dog.notes !== dog.pickupInstructions ? (
          <section className="grg-sheet-notes">
            <h3>Reservation notes</h3>
            <p className="grg-sheet-copy">{dog.notes}</p>
          </section>
        ) : null}
        <dl className="grg-sheet-facts">
          <div>
            <dt>Account phone</dt>
            <dd>{dog.ownerPhone || "—"}</dd>
          </div>
          <div>
            <dt>Home address</dt>
            <dd>{dog.homeAddress || "No home stop"}</dd>
          </div>
          <div>
            <dt>Pickup</dt>
            <dd>{pickupCell(dog)}</dd>
          </div>
          <div>
            <dt>Drop-off</dt>
            <dd>{dropoffCell(dog)}</dd>
          </div>
        </dl>
      </div>
    </div>,
    document.body
  );
}
