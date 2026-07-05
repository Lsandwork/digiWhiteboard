import Image from "next/image";

type FitdogDashboardIconProps = {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
};

export function FitdogDashboardIcon({ src, alt = "", size = 24, className = "" }: FitdogDashboardIconProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`fitdog-dash-icon ${className}`.trim()}
      aria-hidden={!alt}
    />
  );
}
