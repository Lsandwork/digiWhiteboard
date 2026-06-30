import { PawPrint } from "lucide-react";

type EmptyBoardStateProps = {
  mode: "in" | "out";
};

export function EmptyBoardState({ mode }: EmptyBoardStateProps) {
  return (
    <div className="grid min-h-[220px] flex-1 place-items-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/30 px-6 py-10 text-center sm:min-h-[280px]">
      <div>
        <PawPrint className="mx-auto mb-4 h-12 w-12 text-slate-600" strokeWidth={1.5} />
        <p className="text-xl font-semibold text-slate-300 sm:text-2xl">
          {mode === "in" ? "No dogs currently checking in." : "No dogs currently checking out."}
        </p>
      </div>
    </div>
  );
}
