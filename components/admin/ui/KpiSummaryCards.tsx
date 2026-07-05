import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_UI } from "@/lib/fitdog-dashboard/assets";

export type KpiCard = {
  id: string;
  label: string;
  value: number;
  helper: string;
  icon: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

export function KpiSummaryCards({ cards }: { cards: KpiCard[] }) {
  return (
    <section className="fitdog-kpi-grid" aria-label="Summary metrics">
      {cards.map((card) => (
        <article key={card.id} className={`fitdog-kpi-card fitdog-kpi-card--${card.tone ?? "default"}`}>
          <div className="fitdog-kpi-card__icon" aria-hidden>
            <FitdogDashboardIcon src={card.icon} size={40} />
          </div>
          <div className="fitdog-kpi-card__body">
            <p className="fitdog-kpi-card__value">{card.value}</p>
            <p className="fitdog-kpi-card__label">{card.label}</p>
            <p className="fitdog-kpi-card__helper">{card.helper}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

export function shiftLogKpiCards(input: {
  openCount: number;
  needsReviewCount: number;
  dueTodayCount: number;
  urgentCount: number;
}): KpiCard[] {
  return [
    {
      id: "open",
      label: "Open Items",
      value: input.openCount,
      helper: "Require action",
      icon: FITDOG_UI.openItems,
      tone: "info"
    },
    {
      id: "review",
      label: "Needs Review",
      value: input.needsReviewCount,
      helper: "Awaiting review",
      icon: FITDOG_UI.needsReview,
      tone: "warning"
    },
    {
      id: "due",
      label: "Due Today",
      value: input.dueTodayCount,
      helper: "Due by end of shift",
      icon: FITDOG_UI.dueToday,
      tone: "default"
    },
    {
      id: "urgent",
      label: "Urgent",
      value: input.urgentCount,
      helper: "High priority items",
      icon: FITDOG_UI.urgent,
      tone: "danger"
    }
  ];
}
