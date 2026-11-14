import type { EngagementActor } from "@/lib/team-engagement/types";

export type BarkOutPostingState = {
  canPost: boolean;
  blockedReason?: "impersonated" | "missing_permission" | "feature_disabled";
  blockedMessage?: string;
};

export function barkOutPostingState(actor: EngagementActor, options?: { barkOutsEnabled?: boolean }): BarkOutPostingState {
  if (options?.barkOutsEnabled === false) {
    return {
      canPost: false,
      blockedReason: "feature_disabled",
      blockedMessage: "Bark Outs are turned off in Team Engagement settings."
    };
  }
  if (actor.impersonated) {
    return {
      canPost: false,
      blockedReason: "impersonated",
      blockedMessage:
        "You are viewing RuffOps as another employee. Exit “Log In As Employee” so they can give a Bark Out from their own account—or sign in as them directly."
    };
  }
  const mayParticipate =
    actor.permissions.includes("engagement.participate") || actor.permissions.includes("engagement.create_bark_out");
  if (!mayParticipate) {
    return {
      canPost: false,
      blockedReason: "missing_permission",
      blockedMessage:
        "Team Engagement participation is off for your role. An admin can enable “participate” for your role in permissions."
    };
  }
  return { canPost: true };
}