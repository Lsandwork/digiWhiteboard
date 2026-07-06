import type { DemoSandbox } from "@/lib/demo/constants";
import {
  DEFAULT_STAFF_PUSH_NOTICES,
  buildOwnerComplaintNoticeInput,
  normalizeNoticeInput,
  normalizeOwnerComplaintCategory,
  sanitizeDogHandlerName,
  type StaffPushNotice
} from "@/lib/staff/push-notices";

const DEFAULT_DISPLAY_MINUTES = 5;

function demoNoticeId() {
  return `demo-notice-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function expiresFromMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function normalizeDisplayMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DISPLAY_MINUTES;
  return Math.min(120, Math.round(parsed));
}

function sortNotices(notices: StaffPushNotice[]) {
  return [...notices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getActiveNotice(notices: StaffPushNotice[]) {
  const now = Date.now();
  return sortNotices(notices).find((notice) => {
    if (!notice.is_active || notice.cleared_at) return false;
    if (notice.expires_at && new Date(notice.expires_at).getTime() <= now) return false;
    return true;
  }) ?? null;
}

function deactivateAll(notices: StaffPushNotice[], actor: string | null, exceptId?: string) {
  const now = new Date().toISOString();
  return notices.map((notice) => {
    if (!notice.is_active || notice.id === exceptId) return notice;
    return { ...notice, is_active: false, cleared_at: now, updated_at: now, updated_by: actor };
  });
}

function buildNotice(
  normalized: ReturnType<typeof normalizeNoticeInput>,
  actor: string | null,
  active: boolean,
  id?: string
): StaffPushNotice {
  const now = new Date().toISOString();
  const minutes = normalized.display_duration_minutes ?? DEFAULT_DISPLAY_MINUTES;
  return {
    id: id ?? demoNoticeId(),
    title: normalized.title,
    message: normalized.message,
    priority: normalized.priority,
    display_mode: normalized.display_mode,
    is_active: active,
    is_default: normalized.is_default,
    notice_type: normalized.notice_type,
    complaint_category: normalized.complaint_category,
    dog_handler_name: normalized.dog_handler_name,
    created_by: actor,
    updated_by: actor,
    pushed_at: active ? now : null,
    expires_at: active ? expiresFromMinutes(minutes) : null,
    display_duration_minutes: minutes,
    cleared_at: null,
    schedule_enabled: false,
    scheduled_at: null,
    recurrence: "none",
    next_scheduled_at: null,
    created_at: now,
    updated_at: now
  };
}

function pushNoticeInSandbox(sandbox: DemoSandbox, notice: StaffPushNotice, actor: string | null) {
  const now = new Date().toISOString();
  const minutes = notice.display_duration_minutes ?? DEFAULT_DISPLAY_MINUTES;
  const pushed: StaffPushNotice = {
    ...notice,
    is_active: true,
    pushed_at: now,
    expires_at: expiresFromMinutes(minutes),
    cleared_at: null,
    updated_at: now,
    updated_by: actor
  };
  const notices = deactivateAll(sandbox.staff_push_notices, actor, notice.id).map((item) =>
    item.id === notice.id ? pushed : item
  );
  if (!notices.some((item) => item.id === notice.id)) {
    notices.unshift(pushed);
  }
  return { ...sandbox, staff_push_notices: sortNotices(notices), last_updated: now };
}

export function demoStaffPushBoardState(sandbox: DemoSandbox) {
  return {
    activeNotice: getActiveNotice(sandbox.staff_push_notices),
    notices: sortNotices(sandbox.staff_push_notices)
  };
}

export function applyDemoStaffPushAction(
  sandbox: DemoSandbox,
  body: Record<string, unknown>,
  actor: string | null
): { sandbox: DemoSandbox; notice: StaffPushNotice | null; report?: { id: string } } {
  const action = String(body.action ?? "create");
  const now = new Date().toISOString();

  if (action === "clear") {
    return {
      sandbox: {
        ...sandbox,
        staff_push_notices: deactivateAll(sandbox.staff_push_notices, actor),
        last_updated: now
      },
      notice: null
    };
  }

  if (action === "push_default") {
    const title = String(body.title ?? "").trim();
    const defaultNotice = DEFAULT_STAFF_PUSH_NOTICES.find((notice) => notice.title === title);
    if (!defaultNotice) throw new Error("Unknown default notice.");
    const normalized = normalizeNoticeInput({
      ...defaultNotice,
      display_duration_minutes: body.display_duration_minutes
    });
    const notice = buildNotice(normalized, actor, true);
    return {
      sandbox: pushNoticeInSandbox(sandbox, notice, actor),
      notice
    };
  }

  if (action === "push_dog_handler_complaint" || action === "push_owner_complaint") {
    const complaintCategory = normalizeOwnerComplaintCategory(body.complaint_category);
    if (!complaintCategory) throw new Error("Please select an owner complaint reason before pushing this notice.");
    const dogHandlerName = sanitizeDogHandlerName(body.dog_handler_name);
    if (!dogHandlerName) throw new Error("Please enter the dog handler name before pushing this notice.");
    const normalized = normalizeNoticeInput(
      buildOwnerComplaintNoticeInput(complaintCategory, dogHandlerName, body.display_duration_minutes)
    );
    const notice = buildNotice(normalized, actor, true);
    return {
      sandbox: pushNoticeInSandbox(sandbox, notice, actor),
      notice,
      report: { id: `demo-report-${Date.now()}` }
    };
  }

  if (action === "push_existing") {
    const id = String(body.id ?? "").trim();
    if (!id) throw new Error("Notice id is required.");
    const existing = sandbox.staff_push_notices.find((notice) => notice.id === id);
    if (!existing) throw new Error("Notice not found.");
    const nextSandbox = pushNoticeInSandbox(sandbox, existing, actor);
    const notice = getActiveNotice(nextSandbox.staff_push_notices);
    return { sandbox: nextSandbox, notice };
  }

  if (action === "create_and_push") {
    const normalized = normalizeNoticeInput(body);
    const notice = buildNotice(normalized, actor, true);
    return {
      sandbox: pushNoticeInSandbox(sandbox, notice, actor),
      notice
    };
  }

  const normalized = normalizeNoticeInput(body);
  const notice = buildNotice(normalized, actor, false);
  return {
    sandbox: {
      ...sandbox,
      staff_push_notices: sortNotices([notice, ...sandbox.staff_push_notices]),
      last_updated: now
    },
    notice
  };
}

export function pushDemoStaffNoticeById(sandbox: DemoSandbox, id: string, actor: string | null) {
  const existing = sandbox.staff_push_notices.find((notice) => notice.id === id);
  if (!existing) throw new Error("Notice not found.");
  const nextSandbox = pushNoticeInSandbox(sandbox, existing, actor);
  const notice = getActiveNotice(nextSandbox.staff_push_notices);
  if (!notice) throw new Error("Unable to push notice.");
  return { sandbox: nextSandbox, notice };
}

export function updateDemoStaffNotice(
  sandbox: DemoSandbox,
  id: string,
  body: Record<string, unknown>,
  actor: string | null
) {
  const existing = sandbox.staff_push_notices.find((notice) => notice.id === id);
  if (!existing) throw new Error("Notice not found.");
  const normalized = normalizeNoticeInput({ ...existing, ...body });
  const updated = buildNotice(normalized, actor, existing.is_active, existing.id);
  const notices = sandbox.staff_push_notices.map((notice) => (notice.id === id ? updated : notice));
  return {
    sandbox: { ...sandbox, staff_push_notices: sortNotices(notices), last_updated: new Date().toISOString() },
    notice: updated
  };
}

export function deleteDemoStaffNotice(sandbox: DemoSandbox, id: string) {
  return {
    ...sandbox,
    staff_push_notices: sandbox.staff_push_notices.filter((notice) => notice.id !== id),
    last_updated: new Date().toISOString()
  };
}
