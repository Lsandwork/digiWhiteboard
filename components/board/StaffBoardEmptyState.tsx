import Image from "next/image";

const ASSET_BASE = "/assets/fitdog/staff-empty-state";

export function StaffBoardEmptyState() {
  return (
    <section
      className="staff-board-empty-state"
      aria-label="No active check-ins or check-outs"
      data-staff-board-layout="empty"
    >
      <div className="staff-board-empty-state__panel">
        <div className="staff-board-empty-state__icon-wrap" aria-hidden="true">
          <Image
            src={`${ASSET_BASE}/fitdog-empty-in-out-icon.svg`}
            alt=""
            width={112}
            height={112}
            className="staff-board-empty-state__icon"
            priority
          />
        </div>

        <h2 className="staff-board-empty-state__headline">
          No dogs are currently checking{" "}
          <span className="staff-board-empty-state__accent">in / out.</span>
        </h2>

        <p className="staff-board-empty-state__support">
          Arrivals and departures will appear here automatically.
        </p>

        <div className="staff-board-empty-state__landscape" aria-hidden="true">
          <Image
            src={`${ASSET_BASE}/fitdog-empty-landscape-orange.svg`}
            alt=""
            width={960}
            height={280}
            className="staff-board-empty-state__landscape-art"
          />
        </div>

        <div className="staff-board-empty-state__paw" aria-hidden="true">
          <Image
            src={`${ASSET_BASE}/fitdog-empty-paw-divider.svg`}
            alt=""
            width={48}
            height={48}
            className="staff-board-empty-state__paw-icon"
          />
        </div>
      </div>

      <div className="staff-board-empty-state__quiet" role="status">
        <Image
          src={`${ASSET_BASE}/fitdog-empty-quiet-heart.svg`}
          alt=""
          width={28}
          height={28}
          className="staff-board-empty-state__quiet-icon"
          aria-hidden="true"
        />
        <div>
          <p className="staff-board-empty-state__quiet-title">All quiet right now</p>
          <p className="staff-board-empty-state__quiet-caption">
            No active arrivals or departures at the moment.
          </p>
        </div>
      </div>
    </section>
  );
}
