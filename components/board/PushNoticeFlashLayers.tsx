type PushNoticeFlashLayersProps = {
  tone?: "alert" | "reminder";
};

export function PushNoticeFlashLayers({ tone = "alert" }: PushNoticeFlashLayersProps) {
  const toneClass = tone === "reminder" ? "staff-push-notice__flash-layer--reminder" : "";

  return (
    <>
      <div className={`staff-push-notice__flash ${toneClass}`} aria-hidden="true" />
      <div className={`staff-push-notice__flash staff-push-notice__flash--secondary ${toneClass}`} aria-hidden="true" />
      <div className={`staff-push-notice__flash staff-push-notice__flash--tertiary ${toneClass}`} aria-hidden="true" />
      <div className={`staff-push-notice__edge-flash ${toneClass}`} aria-hidden="true" />
      <div className="staff-push-notice__scanlines" aria-hidden="true" />
      <div className="staff-push-notice__stripes" aria-hidden="true" />
      <div className={`staff-push-notice__strobe-ring ${toneClass}`} aria-hidden="true" />
      <div className={`staff-push-notice__strobe-ring staff-push-notice__strobe-ring--outer ${toneClass}`} aria-hidden="true" />
      <span className={`staff-push-notice__beacon staff-push-notice__beacon--tl ${toneClass}`} aria-hidden="true" />
      <span className={`staff-push-notice__beacon staff-push-notice__beacon--tr ${toneClass}`} aria-hidden="true" />
      <span className={`staff-push-notice__beacon staff-push-notice__beacon--bl ${toneClass}`} aria-hidden="true" />
      <span className={`staff-push-notice__beacon staff-push-notice__beacon--br ${toneClass}`} aria-hidden="true" />
    </>
  );
}

export type PushNoticeBoardVeilTone = "alert" | "reminder" | "grooming" | "trainer" | "cast";

export function PushNoticeBoardVeil({
  active,
  tone = "alert",
  label = "Push Notice Active"
}: {
  active: boolean;
  tone?: PushNoticeBoardVeilTone;
  label?: string;
}) {
  if (!active) return null;

  return (
    <>
      <div className={`push-board-veil push-board-veil--${tone}`} aria-hidden="true" />
      <div className={`push-board-veil push-board-veil--secondary push-board-veil--${tone}`} aria-hidden="true" />
      <div className={`push-board-veil-vignette push-board-veil-vignette--${tone}`} aria-hidden="true" />
      <div className={`push-board-veil-bar push-board-veil-bar--${tone}`} aria-hidden="true">
        <span>{label}</span>
      </div>
    </>
  );
}
