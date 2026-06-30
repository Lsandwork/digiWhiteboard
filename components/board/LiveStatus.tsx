import clsx from "clsx";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type LiveStatusProps = {
  connection: ConnectionState;
};

function statusLabel(connection: ConnectionState) {
  if (connection === "live") return "LIVE";
  if (connection === "polling") return "LIVE";
  if (connection === "connecting") return "CONNECTING";
  return "OFFLINE";
}

function statusTone(connection: ConnectionState) {
  if (connection === "live" || connection === "polling") return "text-fitdog-green";
  if (connection === "connecting") return "text-sky-300";
  return "text-rose-300";
}

function dotClass(connection: ConnectionState) {
  if (connection === "live" || connection === "polling") {
    return "bg-fitdog-green shadow-[0_0_12px_rgba(104,247,127,0.65)] animate-pulseSoft";
  }
  if (connection === "connecting") return "bg-sky-300";
  return "bg-rose-300";
}

export function LiveStatus({ connection }: LiveStatusProps) {
  const isHealthy = connection === "live" || connection === "polling";
  const tone = statusTone(connection);

  return (
    <div className="board-chip inline-flex items-center gap-2.5 px-4 py-2">
      <span className={clsx("h-2.5 w-2.5 rounded-full", dotClass(connection))} />
      <div className="leading-tight">
        <div className={clsx("text-sm font-black tracking-wide", tone)}>{statusLabel(connection)}</div>
        <div className="text-xs text-slate-400">
          {isHealthy ? "Board is active" : connection === "connecting" ? "Connecting…" : "Sync unavailable"}
        </div>
      </div>
    </div>
  );
}
