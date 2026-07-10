"use client";

import { memo } from "react";
import type { CastLiteGroomingPush, CastLitePushNotice } from "@/lib/whiteboard/state";

export const CastLitePushBanner = memo(function CastLitePushBanner({
  notice,
  label = "Push Notice"
}: {
  notice: CastLitePushNotice;
  label?: string;
}) {
  const urgent = notice.priority === "urgent" || notice.display_mode === "urgent";
  return (
    <section className={`cast-lite-push ${urgent ? "cast-lite-push--urgent" : ""}`} role="status">
      <p className="cast-lite-push__label">{label}</p>
      <h2 className="cast-lite-push__title">{notice.title}</h2>
      {notice.message ? <p className="cast-lite-push__message">{notice.message}</p> : null}
    </section>
  );
});

export const CastLiteGroomingBanner = memo(function CastLiteGroomingBanner({
  notice
}: {
  notice: CastLiteGroomingPush;
}) {
  return (
    <section className="cast-lite-push cast-lite-push--grooming" role="status">
      <p className="cast-lite-push__label">Grooming Push</p>
      <h2 className="cast-lite-push__title">{notice.dog_name}</h2>
      {notice.owner_name ? <p className="cast-lite-push__message">Owner: {notice.owner_name}</p> : null}
    </section>
  );
});
