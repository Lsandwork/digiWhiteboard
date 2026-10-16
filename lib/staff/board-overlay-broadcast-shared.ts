/** Client-safe Realtime Broadcast identifiers for staff board overlays. */
export const BOARD_OVERLAY_BROADCAST_TOPIC = "ruffops-board-overlays";
export const BOARD_OVERLAY_BROADCAST_EVENT = "overlays-changed";

/**
 * Realtime Broadcast delivers by exact channel topic: the subscribing
 * channel name MUST equal the topic the server publishes to, or no
 * message is ever delivered. Never suffix it per component/department.
 */
export function getBoardOverlayChannelName() {
  return BOARD_OVERLAY_BROADCAST_TOPIC;
}
