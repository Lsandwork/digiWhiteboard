import type { BlogStatus } from "@/lib/blog/constants";
import type { PermissionKey } from "@/lib/admin/permissions";

export type PipelineColumn = "topicIdeas" | "drafts" | "needsReview" | "approved" | "scheduled";

const DRAFT_LIKE = new Set([
  "DRAFTING",
  "EDITING",
  "PRACTICAL_REVIEW",
  "EMPATHY_REVIEW",
  "NATURAL_VOICE_REVIEW",
  "SEO_REVIEW",
  "NEEDS_CHANGES",
  "IMAGE_SELECTION",
  "IMAGE_REVIEW",
  "FACT_CHECK",
  "BRAND_REVIEW",
  "BRIEF_READY",
  "RESEARCHING",
  "OUTLINING",
  "RESEARCH_READY",
  "BRIEF_GENERATING",
  "TOPIC_REVIEW",
  "IDEA"
]);

export function pipelineColumnForStatus(status: string): PipelineColumn | null {
  if (status === "HUMAN_REVIEW") return "needsReview";
  if (status === "APPROVED") return "approved";
  if (status === "SCHEDULED" || status === "PUBLISHING") return "scheduled";
  if (DRAFT_LIKE.has(status)) return "drafts";
  return null;
}

export type WorkflowTransitionRequest = {
  kind: "article" | "topic";
  id: string;
  fromColumn: PipelineColumn;
  toColumn: PipelineColumn;
  scheduledFor?: string;
  factCheckStatus?: string | null;
  humanEditorialScore?: number | null;
  humanScoreThreshold?: number;
};

export type WorkflowTransitionPlan =
  | {
      ok: true;
      action: "submit_for_review" | "approve" | "schedule" | "unschedule_to_approved" | "return_to_draft" | "generate_from_topic";
      targetStatus?: BlogStatus;
      permission: PermissionKey;
      requiresConfirm: boolean;
      message?: string;
    }
  | { ok: false; error: string };

/** Server-side workflow rules for the dashboard pipeline. */
export function planPipelineTransition(input: WorkflowTransitionRequest): WorkflowTransitionPlan {
  if (input.fromColumn === input.toColumn) {
    return { ok: false, error: "Item is already in that stage." };
  }

  if (input.kind === "topic") {
    if (input.fromColumn === "topicIdeas" && input.toColumn === "drafts") {
      return {
        ok: true,
        action: "generate_from_topic",
        permission: "blog.create",
        requiresConfirm: true,
        message: "Start article generation from this topic?"
      };
    }
    return { ok: false, error: "Topic ideas can only move to Drafts by starting generation." };
  }

  const { fromColumn, toColumn } = input;

  if (fromColumn === "drafts" && toColumn === "needsReview") {
    return {
      ok: true,
      action: "submit_for_review",
      targetStatus: "HUMAN_REVIEW",
      permission: "blog.edit",
      requiresConfirm: false
    };
  }

  if (fromColumn === "needsReview" && toColumn === "approved") {
    if (input.factCheckStatus === "failed") {
      return { ok: false, error: "Articles with failed fact checks cannot be approved." };
    }
    const score = Number(input.humanEditorialScore || 0);
    const threshold = Number(input.humanScoreThreshold || 90);
    if (score > 0 && score < threshold) {
      return {
        ok: false,
        error: `Human editorial score ${score} is below the threshold (${threshold}).`
      };
    }
    return {
      ok: true,
      action: "approve",
      targetStatus: "APPROVED",
      permission: "blog.approve",
      requiresConfirm: true,
      message: "Approve this article for scheduling?"
    };
  }

  if (fromColumn === "approved" && toColumn === "scheduled") {
    if (!input.scheduledFor) {
      return { ok: false, error: "A valid publish date is required to schedule." };
    }
    const when = new Date(input.scheduledFor);
    if (Number.isNaN(when.getTime())) {
      return { ok: false, error: "Invalid schedule date." };
    }
    return {
      ok: true,
      action: "schedule",
      targetStatus: "SCHEDULED",
      permission: "blog.schedule",
      requiresConfirm: true,
      message: `Schedule for ${when.toLocaleString()}?`
    };
  }

  if (fromColumn === "scheduled" && toColumn === "approved") {
    return {
      ok: true,
      action: "unschedule_to_approved",
      targetStatus: "APPROVED",
      permission: "blog.schedule",
      requiresConfirm: true,
      message: "Move this scheduled article back to Approved?"
    };
  }

  if (fromColumn === "needsReview" && toColumn === "drafts") {
    return {
      ok: true,
      action: "return_to_draft",
      targetStatus: "NEEDS_CHANGES",
      permission: "blog.review",
      requiresConfirm: true,
      message: "Return this article to drafts / needs changes?"
    };
  }

  if (fromColumn === "approved" && toColumn === "needsReview") {
    return {
      ok: true,
      action: "return_to_draft",
      targetStatus: "HUMAN_REVIEW",
      permission: "blog.approve",
      requiresConfirm: true,
      message: "Move this approved article back to Needs Review?"
    };
  }

  return {
    ok: false,
    error: `Transition from ${fromColumn} to ${toColumn} is not allowed.`
  };
}

export function comparePeriodLabel(range: string) {
  if (range === "7d") return "vs previous 7 days";
  if (range === "90d") return "vs previous 90 days";
  if (range === "year") return "vs prior year-to-date window";
  return "vs last 30 days";
}
