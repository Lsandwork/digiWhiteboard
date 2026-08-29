import { formatTempF, type SantaMonicaWeather } from "@/lib/staff/santa-monica-weather";

type BoardWeatherChipProps = {
  weather: SantaMonicaWeather | null;
  compact?: boolean;
  className?: string;
};

/** Santa Monica temperature under the staff board clock. */
export function BoardWeatherChip({ weather, compact = false, className = "" }: BoardWeatherChipProps) {
  if (!weather) return null;

  return (
    <div
      className={`board-weather-chip ${weather.heatAlert ? "board-weather-chip--heat" : ""} ${compact ? "board-weather-chip--compact" : ""} ${className}`.trim()}
      aria-label={`${formatTempF(weather.tempF)} in Santa Monica`}
    >
      <span className="board-weather-chip__temp">{formatTempF(weather.tempF)}</span>
      <span className="board-weather-chip__sep" aria-hidden="true">
        ·
      </span>
      <span className="board-weather-chip__place">Santa Monica</span>
      {weather.heatAlert ? <span className="board-weather-chip__heat">Heat</span> : null}
    </div>
  );
}
