"use client";

import { useState } from "react";

/** Loads a pack graphic; hides itself if the file is missing (until the asset ZIP is extracted). */
export function PackAssetImage({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static pack assets under /public
    <img src={src} alt={alt} className={className} loading="lazy" decoding="async" onError={() => setHidden(true)} />
  );
}