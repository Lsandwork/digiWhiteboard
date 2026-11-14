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
  if (!actor.permissions.includes("engagement.create_bark_out")) {
    return {
      canPost: false,
      blockedReason: "missing_permission",
      blockedMessage: "Your role is not allowed to post Bark Outs. Ask an admin to confirm engagement permissions for your role."
    };
  }
  return { canPost: true };
}