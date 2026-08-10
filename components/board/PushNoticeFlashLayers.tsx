/**
 * Legacy flash/veil chrome for the old striped push-notice design.
 * Kept as no-ops so existing call sites compile; the approved OpsAlert board
 * owns all alert visuals and does not use these layers.
 */

type PushNoticeFlashLayersProps = {
  tone?: "alert" | "reminder";
};

export function PushNoticeFlashLayers(_props: PushNoticeFlashLayersProps) {
  return null;
}

export type PushNoticeBoardVeilTone = "alert" | "reminder" | "grooming" | "trainer" | "cast";

export function PushNoticeBoardVeil({
  active
}: {
  active: boolean;
  tone?: PushNoticeBoardVeilTone;
  label?: string;
}) {
  if (!active) return null;
  // Soft navy dim only — never stripes, scanlines, or paw decorations.
  return <div className="ops-alert-board-dim" aria-hidden="true" />;
}
