"use client";

import { useState } from "react";
import Image from "next/image";

type LobbyAssetImageProps = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  fallbackSrc?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  fill?: boolean;
  sizes?: string;
  onFailed?: () => void;
};

export function LobbyAssetImage({
  src,
  alt = "",
  width,
  height,
  className,
  fallbackSrc,
  priority,
  loading = "lazy",
  fill,
  sizes,
  onFailed
}: LobbyAssetImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const isSvg = currentSrc.toLowerCase().endsWith(".svg");

  const handleError = () => {
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      return;
    }
    onFailed?.();
  };

  if (isSvg) {
    if (fill) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentSrc}
          alt={alt}
          className={className}
          loading={priority ? "eager" : loading}
          onError={handleError}
        />
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={currentSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? "eager" : loading}
        onError={handleError}
      />
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      fill={fill}
      sizes={sizes}
      unoptimized
      onError={handleError}
    />
  );
}
