import type { ReactNode } from "react";

type CastVariant = "lobby" | "staff";

type IllustrationProps = {
  variant?: CastVariant;
  className?: string;
};

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 360"
      role="img"
      aria-label={label}
      className="h-auto w-full"
    >
      <rect width="640" height="360" rx="16" fill="#f8fafc" />
      <rect x="12" y="12" width="616" height="336" rx="12" fill="#0f172a" stroke="#f15f2a" strokeWidth="2" />
      {children}
    </svg>
  );
}

export function CastChromeIllustration({ variant = "lobby", className }: IllustrationProps) {
  const url =
    variant === "staff"
      ? "fitdog-gingr-status-board.vercel.app/"
      : "fitdog-gingr-status-board.vercel.app/lobby/checkouts";
  const title = variant === "staff" ? "Staff Digital Whiteboard" : "Fitdog Lobby Whiteboard";

  return (
    <div className={className}>
      <Frame label="Step 1: Open Google Chrome">
        <circle cx="36" cy="36" r="6" fill="#ef4444" />
        <circle cx="56" cy="36" r="6" fill="#f59e0b" />
        <circle cx="76" cy="36" r="6" fill="#22c55e" />
        <rect x="96" y="24" width="520" height="28" rx="8" fill="#1e293b" />
        <text x="120" y="43" fill="#cbd5e1" fontFamily="system-ui, sans-serif" fontSize="13">
          {url}
        </text>
        <rect x="24" y="64" width="592" height="268" rx="8" fill="#020617" />
        <text x="320" y="180" fill="#ffffff" fontFamily="system-ui, sans-serif" fontSize="24" fontWeight="700" textAnchor="middle">
          {title}
        </text>
        <text x="320" y="212" fill="#94a3b8" fontFamily="system-ui, sans-serif" fontSize="14" textAnchor="middle">
          Open this page in Google Chrome on the desk computer
        </text>
        <circle cx="572" cy="36" r="20" fill="#4285f4" />
        <text x="572" y="42" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="16" fontWeight="700" textAnchor="middle">
          C
        </text>
        <rect x="24" y="318" width="180" height="28" rx="6" fill="#f15f2a" />
        <text x="114" y="337" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="700" textAnchor="middle">
          Step 1 · Open Chrome
        </text>
      </Frame>
    </div>
  );
}

export function CastButtonIllustration({ variant = "lobby", className }: IllustrationProps) {
  return (
    <div className={className}>
      <Frame label="Step 2: Click Cast to TV">
        <rect x="24" y="64" width="592" height="268" rx="8" fill="#020617" />
        <rect x="430" y="88" width="168" height="44" rx="10" fill="#f15f2a" stroke="#fff" strokeWidth="3" />
        <text x="514" y="116" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="15" fontWeight="700" textAnchor="middle">
          Cast to TV
        </text>
        <path d="M400 110 H430 V96 L455 116 L430 136 V122 H400 Z" fill="#fbbf24" />
        <text x="320" y="200" fill="#94a3b8" fontFamily="system-ui, sans-serif" fontSize="14" textAnchor="middle">
          {variant === "staff"
            ? "Find Cast to TV on the staff whiteboard page"
            : "Find Cast to TV on the lobby whiteboard page"}
        </text>
        <rect x="24" y="318" width="200" height="28" rx="6" fill="#f15f2a" />
        <text x="124" y="337" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="700" textAnchor="middle">
          Step 2 · Click Cast to TV
        </text>
      </Frame>
    </div>
  );
}

export function CastPickerIllustration({ variant = "lobby", className }: IllustrationProps) {
  const primaryLabel = variant === "staff" ? "Staff Area TV · Chromecast" : "Lobby TV · Chromecast";

  return (
    <div className={className}>
      <Frame label="Step 3: Select the correct TV">
        <rect x="170" y="48" width="300" height="240" rx="12" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
        <text x="320" y="78" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="16" fontWeight="700" textAnchor="middle">
          Select a device to cast to
        </text>
        <rect x="194" y="96" width="252" height="48" rx="8" fill="#f15f2a" stroke="#fff" strokeWidth="2" />
        <text x="320" y="126" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="14" fontWeight="700" textAnchor="middle">
          {primaryLabel}
        </text>
        <rect x="194" y="156" width="252" height="48" rx="8" fill="#0f172a" stroke="#475569" />
        <text x="320" y="186" fill="#94a3b8" fontFamily="system-ui, sans-serif" fontSize="14" textAnchor="middle">
          Living Room TV
        </text>
        <rect x="194" y="216" width="252" height="48" rx="8" fill="#0f172a" stroke="#475569" />
        <text x="320" y="246" fill="#94a3b8" fontFamily="system-ui, sans-serif" fontSize="14" textAnchor="middle">
          Conference Display
        </text>
        <path d="M140 120 H194 V106 L219 126 L194 146 V132 H140 Z" fill="#fbbf24" />
        <rect x="24" y="318" width="240" height="28" rx="6" fill="#f15f2a" />
        <text x="144" y="337" fill="#fff" fontFamily="system-ui, sans-serif" fontSize="13" fontWeight="700" textAnchor="middle">
          Step 3 · Pick the correct TV
        </text>
      </Frame>
    </div>
  );
}

export function renderCastIllustration(
  illustration: HelpCastIllustrationId,
  variant: CastVariant,
  className?: string
) {
  switch (illustration) {
    case "cast-chrome":
      return <CastChromeIllustration variant={variant} className={className} />;
    case "cast-button":
      return <CastButtonIllustration variant={variant} className={className} />;
    case "cast-picker":
      return <CastPickerIllustration variant={variant} className={className} />;
    default:
      return null;
  }
}

export type HelpCastIllustrationId = "cast-chrome" | "cast-button" | "cast-picker";
