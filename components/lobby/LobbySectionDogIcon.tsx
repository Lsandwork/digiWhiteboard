import { lobbyAssets } from "@/lib/lobby/assets";

type LobbySectionDogIconProps = {
  className?: string;
  size?: number;
};

/** Transparent dog profile mark used beside lobby section headings. */
export function LobbySectionDogIcon({ className = "lobby-section-icon", size = 28 }: LobbySectionDogIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={lobbyAssets.sectionDogIcon}
      alt=""
      width={size}
      height={size}
      className={className}
      loading="eager"
      decoding="async"
      style={{ background: "transparent" }}
    />
  );
}
