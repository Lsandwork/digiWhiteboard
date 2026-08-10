import { parseChecklistItems, residualMessage } from "@/lib/ops-alert/checklist";
import { formatOpsAlertExpires, resolveOpsAlertAccent, resolveOpsAlertAction } from "@/lib/ops-alert/status";
import type { OpsAlertViewModel } from "@/lib/ops-alert/types";
import {
  groomingInstruction,
  ownerDisplayLabel,
  type GroomingPushNotice
} from "@/lib/staff/grooming-push-notices";
import type { TrainerPushNotice } from "@/lib/staff/trainer-push-notices";

function departmentChecklist(notice: {
  action: string;
  notes: string | null;
  safety_tags: string[];
  instruction?: string;
}) {
  const fromNotes = parseChecklistItems(notice.notes);
  const items = [
    notice.instruction,
    notice.action?.trim() || null,
    ...fromNotes,
    ...notice.safety_tags.map((tag) => tag.trim()).filter(Boolean)
  ].filter(Boolean) as string[];

  // Deduplicate while preserving order.
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function opsAlertFromGroomingPush(notice: GroomingPushNotice): OpsAlertViewModel {
  const instruction = groomingInstruction(notice);
  const checklistItems = departmentChecklist({
    action: notice.action,
    notes: notice.notes,
    safety_tags: notice.safety_tags,
    instruction
  });
  const owner = ownerDisplayLabel(notice);
  const accent = resolveOpsAlertAccent({
    status: notice.status === "cleared" ? "completed" : "active",
    alertType: "grooming alert"
  });
  // Grooming is always action-oriented for yard staff.
  const { action, actionLabel } = resolveOpsAlertAction({
    accent: notice.status === "cleared" ? "green" : "orange",
    actionRequired: true,
    status: notice.status === "cleared" ? "completed" : "active"
  });

  return {
    id: notice.id,
    alertType: "GROOMING ALERT",
    title: notice.dog_name,
    subtitle: notice.service,
    scheduledTime: null,
    audience: "DOG HANDLERS + GROOMING",
    message: residualMessage(notice.notes, parseChecklistItems(notice.notes)),
    checklistItems,
    metaRows: [
      { label: "Service", value: notice.service.toUpperCase(), icon: "tag" },
      { label: "Groomer", value: notice.groomer_name.toUpperCase(), icon: "user" },
      ...(owner ? [{ label: "Owner", value: owner.toUpperCase(), icon: "users" as const }] : [])
    ],
    accent: notice.status === "cleared" ? "green" : "orange",
    action,
    actionLabel,
    expirationTime: formatOpsAlertExpires(notice.expires_at),
    createdAt: notice.created_at,
    updatedAt: notice.updated_at,
    status: notice.status,
    note: notice.requested_by ? `Requested by ${notice.requested_by}` : null,
    footer: null,
    mediaUrl: notice.dog_photo_url,
    mediaAlt: notice.dog_name
  };
}

export function opsAlertFromTrainerPush(notice: TrainerPushNotice): OpsAlertViewModel {
  const checklistItems = departmentChecklist({
    action: notice.action,
    notes: notice.notes,
    safety_tags: notice.safety_tags,
    instruction: "BRING DOG TO TRAINER. PLEASE USE SLIP LEAD."
  });
  const owner = notice.owner_name
    ? notice.owner_name
    : notice.owner_initial
      ? `Owner: ${notice.owner_initial}.`
      : null;
  const { action, actionLabel } = resolveOpsAlertAction({
    accent: notice.status === "cleared" ? "green" : "orange",
    actionRequired: true,
    status: notice.status === "cleared" ? "completed" : "active"
  });

  return {
    id: notice.id,
    alertType: "TRAINING ALERT",
    title: notice.dog_name,
    subtitle: notice.service,
    scheduledTime: null,
    audience: "DOG HANDLERS + TRAINING",
    message: residualMessage(notice.notes, parseChecklistItems(notice.notes)),
    checklistItems,
    metaRows: [
      { label: "Service", value: notice.service.toUpperCase(), icon: "tag" },
      { label: "Trainer", value: notice.trainer_name.toUpperCase(), icon: "user" },
      ...(owner ? [{ label: "Owner", value: owner.toUpperCase(), icon: "users" as const }] : [])
    ],
    accent: notice.status === "cleared" ? "green" : "orange",
    action,
    actionLabel,
    expirationTime: formatOpsAlertExpires(notice.expires_at),
    createdAt: notice.created_at,
    updatedAt: notice.updated_at,
    status: notice.status,
    note: notice.requested_by ? `Requested by ${notice.requested_by}` : null,
    footer: null,
    mediaUrl: notice.dog_photo_url,
    mediaAlt: notice.dog_name
  };
}
