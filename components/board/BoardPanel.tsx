import clsx from "clsx";
import { LogIn, LogOut } from "lucide-react";
import type { CheckoutDisplayEntry } from "@/hooks/useCheckoutDisplayTimers";
import type { CheckingInDisplayEntry } from "@/hooks/useNewCheckingInAlerts";
import { DogStatusCard } from "@/components/board/DogStatusCard";
import { EmptyBoardState } from "@/components/board/EmptyBoardState";

type BoardPanelProps = {
  showEmptyState?: boolean;
} & (
  | {
      title: string;
      subtitle: string;
      mode: "in";
      checkingInEntries: CheckingInDisplayEntry[];
      checkingOutEntries?: never;
      showStaffClear?: boolean;
      onClearCheckout?: never;
    }
  | {
      title: string;
      subtitle: string;
      mode: "out";
      checkingOutEntries: CheckoutDisplayEntry[];
      checkingInEntries?: never;
      showStaffClear?: boolean;
      onClearCheckout?: (dogId: string) => void;
    }
);

export function BoardPanel(props: BoardPanelProps) {
  const { title, subtitle, mode, showStaffClear = false, showEmptyState = true } = props;
  const Icon = mode === "in" ? LogIn : LogOut;
  const count = mode === "in" ? props.checkingInEntries.length : props.checkingOutEntries.length;

  return (
    <section
      className={clsx(
        "board-panel flex min-h-0 flex-1 flex-col rounded-3xl p-4 sm:p-5 lg:p-6",
        mode === "in" ? "board-panel-in" : "board-panel-out"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div
            className={clsx(
              "grid h-11 w-11 shrink-0 place-items-center rounded-xl border sm:h-12 sm:w-12",
              mode === "in"
                ? "border-fitdog-blue/50 bg-fitdog-blue/10 text-fitdog-blue"
                : "border-fitdog-orange/50 bg-fitdog-orange/10 text-fitdog-orange"
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase tracking-wide text-white sm:text-3xl">{title}</h2>
            <p
              className={clsx(
                "mt-0.5 text-xs font-bold uppercase tracking-[0.18em] sm:text-sm",
                mode === "in" ? "text-fitdog-blue" : "text-fitdog-orange"
              )}
            >
              {subtitle}
            </p>
          </div>
        </div>

        <div
          className={clsx(
            "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 sm:px-4 sm:py-2.5",
            mode === "in" ? "border-fitdog-blue/40 bg-fitdog-blue/8" : "border-fitdog-orange/40 bg-fitdog-orange/8"
          )}
        >
          <span
            className={clsx(
              "text-3xl font-black leading-none sm:text-4xl",
              mode === "in" ? "text-fitdog-blue" : "text-fitdog-orange"
            )}
          >
            {count}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:text-xs">Total</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 sm:gap-4">
        {mode === "in" ? (
          props.checkingInEntries.length ? (
            props.checkingInEntries.map(({ dog, isNew }) => (
              <DogStatusCard key={dog.id} dog={dog} mode="in" isNew={isNew} />
            ))
          ) : showEmptyState ? (
            <EmptyBoardState mode="in" />
          ) : null
        ) : props.checkingOutEntries.length ? (
          props.checkingOutEntries.map((entry) => (
            <DogStatusCard
              key={entry.stableKey}
              dog={entry.dog}
              mode="out"
              isNew={entry.isNew}
              isAlerting={entry.isAlerting}
              isReminding={entry.isReminding}
              isExpiringSoon={entry.isExpiringSoon}
              showStaffClear={showStaffClear}
              onClear={() => props.onClearCheckout?.(entry.dog.id)}
            />
          ))
        ) : showEmptyState ? (
          <EmptyBoardState mode="out" />
        ) : null}
      </div>
    </section>
  );
}
