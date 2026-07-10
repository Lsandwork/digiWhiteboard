"use client";

import { memo, useRef } from "react";
import type { CastLiteVideoPush } from "@/lib/whiteboard/state";

export const CastLiteVideoPlayer = memo(function CastLiteVideoPlayer({
  notice,
  lowMotion = true
}: {
  notice: CastLiteVideoPush;
  lowMotion?: boolean;
}) {
  const startedRef = useRef(false);

  return (
    <section className={`cast-lite-video ${lowMotion ? "cast-lite-video--low-motion" : ""}`}>
      <video
        className="cast-lite-video__player"
        src={notice.video_url}
        muted
        playsInline
        autoPlay
        loop
        controls={false}
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        onLoadedData={(event) => {
          if (startedRef.current) return;
          startedRef.current = true;
          void event.currentTarget.play().catch(() => undefined);
        }}
      />
      <p className="cast-lite-video__title">{notice.title}</p>
    </section>
  );
});
