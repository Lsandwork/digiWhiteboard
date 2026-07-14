"use client";

import Image from "next/image";
import type { CastTvObjectFit, CastTvPlaylistItem } from "@/lib/cast-tv/types";

type CastTvImageSlideProps = {
  item: CastTvPlaylistItem;
  active: boolean;
  objectFit: CastTvObjectFit;
  transitionMs: number;
  onError: () => void;
};

export function CastTvImageSlide({ item, active, objectFit, transitionMs, onError }: CastTvImageSlideProps) {
  return (
    <div
      className={`cast-tv-slide cast-tv-slide--image ${active ? "is-active" : ""}`}
      style={{ transitionDuration: `${transitionMs}ms` }}
      aria-hidden={!active}
    >
      <Image
        src={item.src}
        alt=""
        fill
        priority={active}
        sizes="100vw"
        className={`cast-tv-slide__media cast-tv-slide__media--${objectFit}`}
        style={{ objectFit }}
        unoptimized
        onError={onError}
      />
    </div>
  );
}
