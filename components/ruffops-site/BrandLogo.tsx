import Image from "next/image";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

type BrandLogoProps = {
  variant?: "light" | "dark";
  showLockup?: boolean;
  className?: string;
};

/**
 * Official ruffOPS wordmark treatment from the brand brief:
 * "ruff" in light tone · "OPS" in brand orange · orange paw mark.
 * Uses the real Fitdog orange paw asset already in the repo.
 */
export function BrandLogo({ variant = "light", showLockup = true, className = "" }: BrandLogoProps) {
  const ruffColor = variant === "light" ? "text-white" : "text-slate-950";
  const lockupColor = variant === "light" ? "text-white/55" : "text-slate-500";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 shadow-[0_10px_30px_-12px_rgba(249,115,22,0.9)]">
        <Image
          src={PRODUCT_SHOTS.pawOrange}
          alt=""
          width={22}
          height={22}
          className="h-5 w-5 brightness-0 invert"
        />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={`font-[family-name:var(--font-ro-display)] text-[1.15rem] font-extrabold tracking-[-0.03em] ${ruffColor}`}
        >
          <span>ruff</span>
          <span className="text-orange-500">OPS</span>
        </span>
        {showLockup ? (
          <span className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] ${lockupColor}`}>
            {SITE.lockup}
          </span>
        ) : null}
      </span>
    </span>
  );
}
