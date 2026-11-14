"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, MapPin, Search, Truck } from "lucide-react";
import { dogHasSportSignUp } from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import type { GingrAppointmentOption } from "@/lib/gingr-route-generator/transportation";
import {
  buildTransportationStops,
  fitdogClubStopAddress,
  type TransportationStop
} from "@/lib/gingr-route-generator/transportation-stops";
import {
  dogMatchesActivityFilter,
  type GingrActivityFilter
} from "@/lib/gingr-route-generator/subject-groups";
import type { GingrRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";

type LegFilter = "all" | "before" | "after" | "boarding" | "owner" | "review" | "notes";
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
  { id: "before", label: "Before / Pickup" },
  { id: "after", label: "After / Drop-off" },
  { id: "boarding", label: "Boarding" },
  { id: "owner", label: "Owner-managed" },
  { id: "review", label: "Needs review" },
  { id: "notes", label: "Has instructions" }
];

const VANS: Array<{ id: GingrRouteVanKey; label: string }> = [
  { id: "van_1", label: "Van 1 · outing" },
  { id: "van_2", label: "Van 2 · outing" },
  { id: "van_3", label: "Van 3 · outing" },
  { id: "van_5", label: "Van 5 · club, class, and taxi" },
  { id: "van_6", label: "Van 6 · club, class, and taxi" }
];

const PARTY_LABEL: Record<GingrAppointmentOption["responsibleParty"], string> = {
  OWNER: "Owner",
  FITDOG: "Fitdog",
  UNKNOWN: "Not stated"
};

const ACTION_LABEL: Record<GingrAppointmentOption["action"], string> = {
  PICKUP: "Pick-up",
  DROPOFF: "Drop-off",
  NONE: "No hand-off",
  UNKNOWN: "Not stated"
};

const PLACE_LABEL: Record<GingrAppointmentOption["location"], string> = {
  HOME: "Home",
  FITDOG_CLUB: "Fitdog Club",
  UNKNOWN: "Not stated"
};

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

type EndCell = {
  title: string;
  van: string | null;
  basis: string | null;
  tone: "van" | "club" | "owner" | "review";
};

/** Start and finish are separate decisions, so each column reads its own end of the plan. */
function endCell(dog: GingrRouteDog, which: "start" | "end"): EndCell {
  const plan = dog.transportPlan;
  const end = which === "start" ? plan.startingLocation : plan.finalDestination;
  const stopType = which === "start" ? plan.pickupStopType : plan.dropoffStopType;
  const van = vanName(dog.routeVanKey);
  const showTime = which === "start" || !plan.pickupStopType;
  const time = showTime && dog.scheduledTimeLabel ? ` · ${dog.scheduledTimeLabel}` : "";

  if (end.locationType === "UNKNOWN") {
    return { title: "Needs review", van: null, basis: "The booking does not decide this", tone: "review" };
  }
  if (end.locationType === "HOME") {
    return {
      title: which === "start" ? "Fitdog picks up at home" : "Fitdog drops off at home",
      van: stopType ? `${van}${time}` : null,
      basis: end.basis,
      tone: "van"
    };
  }
  const clubVan = stopType
    ? `${van}${time} · ${which === "start" ? "loads at" : "returns to"} Fitdog Club`
    : null;
  if (end.responsibleParty === "OWNER") {
    return {
      title: which === "start" ? "Owner drops off at Club" : "Owner collects at Club",
      van: clubVan,
      basis: end.basis,
      tone: "owner"
    };
  }
  return {
    title: which === "start" ? "Boarding at Fitdog Club" : "Returns to boarding",
    van: clubVan,
    basis: end.basis,
    tone: "club"
  };
}

function needsReview(dog: GingrRouteDog): boolean {
  return dog.transportPlan.status === "NEEDS_REVIEW";
}

/** The filter follows the booking's options; the tag only names ends the plan actually gives to the owner. */
function ownerTag(dog: GingrRouteDog): string | null {
  const plan = dog.transportPlan;
  if (!plan.filters.ownerManaged) return null;
  const start = plan.startingLocation.responsibleParty === "OWNER";
  const end = plan.finalDestination.responsibleParty === "OWNER";
  if (start && end) return "Owner-managed";
  if (start) return "Owner drop-off";
  if (end) return "Owner pick-up";
  return null;
}

function instructionText(dog: GingrRouteDog): string | null {
  return dog.dropoffInstructions || dog.pickupInstructions || dog.notes;
}

function preview(text: string | null): string {
  if (!text) return "None on file";
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

function matchesLeg(dog: GingrRouteDog, leg: LegFilter): boolean {
  const { filters } = dog.transportPlan;
  switch (leg) {
    case "before":
      return filters.beforePickup;
    case "after":
      return filters.afterDropoff;
    case "boarding":
      return filters.boarding;
    case "owner":
      return filters.ownerManaged;
    case "review":
      return needsReview(dog);
    case "notes":
      return Boolean(instructionText(dog));
    default:
      return true;
  }
}

export function GingrRouteBoard({
  dogs,
  date,
  loading
}: {
  dogs: GingrRouteDog[];
  date: string;
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
      return [
        dog.name,
        dog.owner,
        dog.ownerFullName,
        dog.homeAddress,
        bookedAs(dog),
        instructionText(dog),
        ...dog.appointmentOptions
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [dogs, leg, query, service]);

  const openDog = dogs.find((dog) => dog.id === openId) ?? null;
  const loadingFirst = loading && !dogs.length;
  const homePickups = filtered.filter((dog) => dog.transportPlan.pickupStopType === "HOME_PICKUP").length;
  const homeDropoffs = filtered.filter((dog) => dog.transportPlan.dropoffStopType === "HOME_DROPOFF").length;
  const clubRiders = filtered.filter(
    (dog) =>
      dog.transportPlan.pickupStopType === "CLUB_PICKUP" || dog.transportPlan.dropoffStopType === "CLUB_DROPOFF"
  ).length;
  const reviewCount = dogs.filter(needsReview).length;
  const missingAddress = filtered.filter(
    (dog) => (dog.pickup || dog.dropoff) && dog.addressStatus !== "ok"
  );

  return (
    <div className="grg-print-root">
      <section className="grg-stats" aria-label="Schedule statistics">
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loadingFirst ? "—" : filtered.length}</div>
          <div className="grg-stat-label">Dogs</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loadingFirst ? "—" : homePickups}</div>
          <div className="grg-stat-label">Home pickups</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loadingFirst ? "—" : homeDropoffs}</div>
          <div className="grg-stat-label">Home drop-offs</div>
        </div>
        <div className="grg-stat-card">
          <div className="grg-stat-value">{loadingFirst ? "—" : clubRiders}</div>
          <div className="grg-stat-label">Ride from / to Club</div>
        </div>
        <div className={`grg-stat-card ${reviewCount ? "grg-stat-card--review" : ""}`}>
          <div className="grg-stat-value">{loadingFirst ? "—" : reviewCount}</div>
          <div className="grg-stat-label">Need review</div>
        </div>
      </section>

      <div className="grg-filters">
        <label className="grg-search">
          <Search size={15} aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dog, owner, address, option, instruction"
            aria-label="Search dogs, owners, addresses, appointment options, or instructions"
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
      <div className="grg-chips" role="tablist" aria-label="Appointment options">
        {LEG_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`grg-chip ${leg === item.id ? "is-active" : ""} ${item.id === "review" && reviewCount ? "grg-chip--review" : ""}`}
            aria-selected={leg === item.id}
            onClick={() => setLeg(item.id)}
          >
            {item.id === "before" ? <Truck size={13} aria-hidden /> : null}
            {item.id === "after" ? <MapPin size={13} aria-hidden /> : null}
            {item.id === "review" ? <AlertTriangle size={13} aria-hidden /> : null}
            {item.label}
            {item.id === "review" && reviewCount ? ` · ${reviewCount}` : null}
          </button>
        ))}
      </div>

      {view === "board" ? (
        <div className="grg-board-scroll">
          {loadingFirst ? <div className="grg-empty"><h3>Loading schedule</h3></div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="grg-empty">
              <h3>No dogs for this filter</h3>
              <p>Try every service, or pick another date.</p>
            </div>
          ) : null}
          {filtered.length ? (
            <table className="grg-board">
              <caption className="grg-board-caption">
                One row per dog. Starts at and Ends at are decided separately from the dog&apos;s appointment
                options. Owner hand-offs at Fitdog Club are never home stops.
              </caption>
              <thead>
                <tr>
                  <th>Dog</th>
                  <th>Booked as</th>
                  <th>Starts at</th>
                  <th>Ends at</th>
                  <th>Drop-off instructions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((dog) => {
                  const note = instructionText(dog);
                  const review = needsReview(dog);
                  const owner = ownerTag(dog);
                  return (
                    <tr
                      key={dog.id}
                      className={[note ? "has-instructions" : "", review ? "needs-review" : ""].join(" ").trim() || undefined}
                    >
                      <td>
                        <div className="grg-dog-name">{dog.name}</div>
                        <div className="grg-dog-owner">
                          {dog.ownerFullName || dog.owner}
                          {dog.ownerPhone ? ` · ${dog.ownerPhone}` : ""}
                        </div>
                        <div className="grg-dog-tags">
                          {dog.transportPlan.isBoarding ? <span className="grg-tag grg-tag--club">Boarding</span> : null}
                          {owner ? <span className="grg-tag grg-tag--owner">{owner}</span> : null}
                          {review ? (
                            <button
                              type="button"
                              className="grg-tag grg-tag--review"
                              onClick={() => setOpenId(dog.id)}
                            >
                              <AlertTriangle size={11} aria-hidden /> Needs review
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="grg-booked">{bookedAs(dog)}</div>
                        {dog.homeAddress ? <div className="grg-dog-owner">{dog.homeAddress}</div> : null}
                        <button type="button" className="grg-options-btn" onClick={() => setOpenId(dog.id)}>
                          {dog.appointmentOptions.length
                            ? `${dog.appointmentOptions.length} appointment option${dog.appointmentOptions.length === 1 ? "" : "s"}`
                            : "No appointment options"}
                        </button>
                      </td>
                      <td>
                        <EndCellView cell={endCell(dog, "start")} />
                      </td>
                      <td>
                        <EndCellView cell={endCell(dog, "end")} />
                      </td>
                      <td>
                        {note ? (
                          <button type="button" className="grg-note-btn" onClick={() => setOpenId(dog.id)}>
                            <span>{preview(note)}</span>
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
        <VanSheets dogs={filtered} date={date} openId={openId} onOpen={setOpenId} />
      )}

      {missingAddress.length ? (
        <p className="grg-export-warning">Address missing: {missingAddress.map((dog) => dog.name).join(", ")}</p>
      ) : null}

      {openDog ? <DogDialog dog={openDog} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function EndCellView({ cell }: { cell: EndCell }) {
  return (
    <div className={`grg-end grg-end--${cell.tone}`}>
      <div className="grg-end-title">{cell.title}</div>
      {cell.van ? <div className="grg-end-van">{cell.van}</div> : null}
      {cell.basis ? <div className="grg-end-basis">{cell.basis}</div> : null}
    </div>
  );
}

function VanSheets({
  dogs,
  date,
  openId,
  onOpen
}: {
  dogs: GingrRouteDog[];
  date: string;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const built = useMemo(() => buildTransportationStops(dogs, date), [dogs, date]);
  const groups = VANS.map((van) => {
    const onVan = built.stops.filter((stop) => stop.routeVanKey === van.id);
    return {
      ...van,
      pickups: onVan.filter((stop) => stop.kind === "PICK_UP"),
      dropoffs: onVan.filter((stop) => stop.kind === "DROP_OFF")
    };
  }).filter((group) => group.pickups.length || group.dropoffs.length);

  return (
    <div className="grg-van-sheets">
      {built.reviewDogs.length ? (
        <section className="grg-review-panel" aria-label="Dogs that need review">
          <h3>
            <AlertTriangle size={14} aria-hidden /> Needs review · {built.reviewDogs.length}
          </h3>
          <p>Stops are only made for the ends the booking decides. Fix these bookings in Gingr, then re-import.</p>
          <ul>
            {built.reviewDogs.map((dog) => (
              <li key={dog.dogId}>
                <button type="button" className="grg-review-dog" onClick={() => onOpen(dog.dogId)}>
                  {dog.dogName}
                </button>{" "}
                <span>{dog.issues.join(" ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.length ? (
        groups.map((group) => (
          <section key={group.id} className="grg-van-sheet">
            <h2>{group.label}</h2>
            <RunTable title="Pickup run" stops={group.pickups} dogs={dogs} openId={openId} onOpen={onOpen} />
            <RunTable title="Drop-off run" stops={group.dropoffs} dogs={dogs} openId={openId} onOpen={onOpen} />
          </section>
        ))
      ) : (
        <div className="grg-empty">
          <h3>No van stops for this filter</h3>
          <p>Dogs whose owner handles both ends at a Club visit stay on the day board.</p>
        </div>
      )}
    </div>
  );
}

function stopPlace(stop: TransportationStop): { title: string; address: string } {
  if (stop.locationType === "FITDOG_CLUB") {
    return {
      title: stop.kind === "PICK_UP" ? "Fitdog Club · load dogs" : "Fitdog Club · return dogs",
      address: fitdogClubStopAddress()
    };
  }
  return {
    title: stop.kind === "PICK_UP" ? "Home pickup" : "Home drop-off",
    address: stop.homeAddress || "Address required"
  };
}

function RunTable({
  title,
  stops,
  dogs,
  openId,
  onOpen
}: {
  title: string;
  stops: TransportationStop[];
  dogs: GingrRouteDog[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const dogsOnRun = stops.reduce((sum, stop) => sum + stop.dogs.length, 0);
  return (
    <div className="grg-run">
      <h3>
        {title} · {stops.length} stop{stops.length === 1 ? "" : "s"} · {dogsOnRun} dog{dogsOnRun === 1 ? "" : "s"}
      </h3>
      {stops.length ? (
        <table className="grg-board grg-board--stops">
          <thead>
            <tr>
              <th>Stop</th>
              <th>Time</th>
              <th>Where</th>
              <th>Dogs</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop, index) => {
              const place = stopPlace(stop);
              return (
                <tr key={stop.key} className={stop.locationType === "FITDOG_CLUB" ? "is-club-stop" : undefined}>
                  <td>{index + 1}</td>
                  <td>{stop.scheduledTime ? timeLabel(stop, dogs) : "—"}</td>
                  <td>
                    <div className="grg-dog-name">{place.title}</div>
                    <div className="grg-dog-owner">{place.address}</div>
                  </td>
                  <td>
                    {stop.dogs.map((entry) => (
                      <div key={entry.dogId} className="grg-stop-dog">
                        <span className="grg-dog-name">{entry.dogName}</span>
                        <span className="grg-dog-owner">
                          {entry.ownerFullName || entry.ownerName} · {entry.reason}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td>
                    {stop.dogs.some((entry) => entry.instructions) ? (
                      stop.dogs
                        .filter((entry) => entry.instructions)
                        .map((entry) => (
                          <button
                            key={entry.dogId}
                            type="button"
                            className="grg-note-btn"
                            onClick={() => onOpen(entry.dogId)}
                          >
                            <span>
                              {stop.dogs.length > 1 ? `${entry.dogName}: ` : ""}
                              {preview(entry.instructions)}
                            </span>
                            <strong>{openId === entry.dogId ? "Reading" : "Open"}</strong>
                          </button>
                        ))
                    ) : (
                      <span className="grg-note-empty">
                        {stop.locationType === "FITDOG_CLUB" ? "Club hand-off" : "None on file"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="grg-run-empty">No stops on this run.</p>
      )}
    </div>
  );
}

function timeLabel(stop: TransportationStop, dogs: GingrRouteDog[]): string {
  const withTime = dogs.find(
    (dog) => stop.dogs.some((entry) => entry.dogId === dog.id) && dog.scheduledTime === stop.scheduledTime
  );
  return withTime?.scheduledTimeLabel || "—";
}

function optionPhase(option: GingrAppointmentOption): string {
  if (option.phase === "BOARDING") return "Boarding";
  if (option.phase === "UNKNOWN") return "Not stated";
  const phase = option.phase === "BEFORE" ? "Before / Pickup" : "After / Drop-off";
  return option.phaseInferred ? `${phase} (from wording)` : phase;
}

function DogDialog({ dog, onClose }: { dog: GingrRouteDog; onClose: () => void }) {
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
  const plan = dog.transportPlan;
  const start = endCell(dog, "start");
  const finish = endCell(dog, "end");

  if (typeof document === "undefined") return null;

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
            <p className="grg-sheet-kicker">Drop-off Instructions &amp; route plan</p>
            <h2 id="grg-instruction-title">
              {dog.name} · {dog.ownerFullName || dog.owner}
            </h2>
          </div>
          <button type="button" className="grg-sheet-close" onClick={onClose}>
            Close
          </button>
        </header>
        <p className="grg-sheet-meta">{bookedAs(dog)}</p>

        {plan.issues.length ? (
          <section className="grg-sheet-review" aria-label="Needs review">
            <h3>
              <AlertTriangle size={13} aria-hidden /> Needs review
            </h3>
            <ul>
              {plan.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </section>
        ) : null}

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

        <div className="grg-sheet-grid grg-sheet-plan">
          <section>
            <h3>Starts at</h3>
            <EndCellView cell={start} />
          </section>
          <section>
            <h3>Ends at</h3>
            <EndCellView cell={finish} />
          </section>
        </div>

        <section className="grg-sheet-notes">
          <h3>Appointment options</h3>
          {dog.appointmentOptionDetails.length ? (
            <table className="grg-board grg-board--options">
              <thead>
                <tr>
                  <th>Option</th>
                  <th>Filter</th>
                  <th>Responsible</th>
                  <th>Action</th>
                  <th>Place</th>
                </tr>
              </thead>
              <tbody>
                {dog.appointmentOptionDetails.map((option, index) => (
                  <tr key={`${option.label}-${index}`} className={option.issue ? "needs-review" : undefined}>
                    <td>
                      <div className="grg-booked">{option.label}</div>
                      {option.optionName && option.optionName !== option.label ? (
                        <div className="grg-dog-owner">Gingr: {option.optionName}</div>
                      ) : null}
                      {option.issue ? <div className="grg-option-issue">{option.issue}</div> : null}
                    </td>
                    <td>{optionPhase(option)}</td>
                    <td>{PARTY_LABEL[option.responsibleParty]}</td>
                    <td>{ACTION_LABEL[option.action]}</td>
                    <td>{PLACE_LABEL[option.location]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="grg-sheet-copy">No appointment options on this booking.</p>
          )}
        </section>

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
            <dt>Van</dt>
            <dd>{plan.fitdogTransports ? vanName(dog.routeVanKey) : "No van stop"}</dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>{plan.status === "OK" ? "Complete" : "Needs review"}</dd>
          </div>
        </dl>
      </div>
    </div>,
    document.body
  );
}
