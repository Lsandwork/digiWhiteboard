"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  Play,
  Save,
  Send,
  Trash2,
  Upload,
  Video,
  XCircle
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { hasPermission, type UserAccess } from "@/lib/admin/permissions";
import {
  CAST_VIDEO_AUTO_CLEAR_OPTIONS,
  CAST_VIDEO_DEPARTMENTS,
  CAST_VIDEO_MAX_BYTES,
  CAST_VIDEO_PRIORITY_OPTIONS,
  type CastVideoAutoClearMode,
  type CastVideoDepartment,
  type CastVideoNotice,
  type CastVideoPriority,
  type CastVideoViewStats
} from "@/lib/staff/cast-video-notices";

type CastVideosPayload = {
  notices: CastVideoNotice[];
  activeNotice: CastVideoNotice | null;
  queue: CastVideoNotice[];
  stats: Record<string, CastVideoViewStats>;
  currentUser: {
    email: string | null;
    role: string | null;
    access?: UserAccess | null;
  };
};

type FormState = {
  id: string | null;
  title: string;
  description: string;
  priority: CastVideoPriority;
  departments: CastVideoDepartment[];
  allow_sound: boolean;
  require_acknowledgement: boolean;
  auto_clear_mode: CastVideoAutoClearMode;
  scheduled_at: string;
  video_storage_path: string | null;
  video_url: string | null;
  thumbnail_storage_path: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
};

const emptyForm = (): FormState => ({
  id: null,
  title: "",
  description: "",
  priority: "normal",
  departments: ["everyone"],
  allow_sound: false,
  require_acknowledgement: false,
  auto_clear_mode: "manual",
  scheduled_at: "",
  video_storage_path: null,
  video_url: null,
  thumbnail_storage_path: null,
  thumbnail_url: null,
  mime_type: null,
  file_size_bytes: null
});

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration || 1);
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve(blob);
        },
        "image/jpeg",
        0.82
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
  });
}

export function CastVideosPanel() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [data, setData] = useState<CastVideosPayload | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/cast-videos", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load cast videos.");
      setData(body as CastVideosPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load cast videos.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const canManage = useMemo(() => {
    if (!data) return false;
    return hasPermission(data.currentUser.access ?? null, "manage_cast_videos")
      || ["owner_admin", "manager_admin"].includes(data.currentUser.role ?? "");
  }, [data]);

  const hasVideo = Boolean(form.video_url || localPreviewUrl);

  function toggleDepartment(department: CastVideoDepartment) {
    setForm((current) => {
      if (department === "everyone") return { ...current, departments: ["everyone"] };
      const withoutEveryone = current.departments.filter((item) => item !== "everyone");
      const next = withoutEveryone.includes(department)
        ? withoutEveryone.filter((item) => item !== department)
        : [...withoutEveryone, department];
      return { ...current, departments: next.length ? next : ["everyone"] };
    });
  }

  async function uploadVideo(file: File) {
    if (file.size > CAST_VIDEO_MAX_BYTES) {
      showToast("Video must be 250MB or smaller.", "error");
      return;
    }

    setBusy(true);
    try {
      const thumbnailBlob = await captureVideoThumbnail(file);
      const formData = new FormData();
      formData.append("video", file);
      if (thumbnailBlob) {
        formData.append("thumbnail", new File([thumbnailBlob], "thumbnail.jpg", { type: "image/jpeg" }));
      }
      if (form.id) formData.append("noticeId", form.id);

      const response = await fetch("/api/admin/cast-videos/upload", {
        method: "POST",
        body: formData
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to upload video.");

      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(URL.createObjectURL(file));
      setForm((current) => ({
        ...current,
        video_storage_path: body.video_storage_path ?? null,
        video_url: body.video_url ?? null,
        thumbnail_storage_path: body.thumbnail_storage_path ?? null,
        thumbnail_url: body.thumbnail_url ?? null,
        mime_type: body.mime_type ?? null,
        file_size_bytes: body.file_size_bytes ?? null
      }));
      showToast("Video uploaded.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to upload video.", "error");
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    return {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      departments: form.departments,
      allow_sound: form.allow_sound,
      require_acknowledgement: form.require_acknowledgement,
      auto_clear_mode: form.auto_clear_mode,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      video_storage_path: form.video_storage_path,
      video_url: form.video_url,
      thumbnail_storage_path: form.thumbnail_storage_path,
      thumbnail_url: form.thumbnail_url,
      mime_type: form.mime_type,
      file_size_bytes: form.file_size_bytes
    };
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/admin/cast-videos", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.id ? { id: form.id, ...payload } : { action: "draft", ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save draft.");
      setForm((current) => ({ ...current, id: body.notice?.id ?? current.id }));
      showToast("Draft saved.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save draft.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function pushNow() {
    if (!hasVideo) {
      showToast("Upload a video before pushing.", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      let noticeId = form.id;
      if (!noticeId) {
        const createResponse = await fetch("/api/admin/cast-videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "draft", ...payload })
        });
        const createBody = await createResponse.json();
        if (!createResponse.ok) throw new Error(createBody.error ?? "Unable to save cast video.");
        noticeId = createBody.notice?.id;
      } else {
        const patchResponse = await fetch("/api/admin/cast-videos", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: noticeId, ...payload })
        });
        const patchBody = await patchResponse.json();
        if (!patchResponse.ok) throw new Error(patchBody.error ?? "Unable to update cast video.");
      }

      const pushResponse = await fetch(`/api/admin/cast-videos/${noticeId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "push" })
      });
      const pushBody = await pushResponse.json();
      if (!pushResponse.ok) throw new Error(pushBody.error ?? "Unable to push cast video.");

      showToast("Cast video pushed to displays.", "success");
      setForm(emptyForm());
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to push cast video.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function schedulePush() {
    if (!form.scheduled_at) {
      showToast("Choose a schedule date and time.", "error");
      return;
    }
    if (!hasVideo) {
      showToast("Upload a video before scheduling.", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      const response = await fetch("/api/admin/cast-videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", ...payload })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to schedule cast video.");
      showToast("Cast video scheduled.", "success");
      setForm(emptyForm());
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to schedule cast video.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearActive(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/cast-videos/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to clear cast video.");
      showToast("Active cast video cleared.", "success");
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear cast video.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteNotice(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/cast-videos/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to delete cast video.");
      showToast("Cast video deleted.", "success");
      if (form.id === id) setForm(emptyForm());
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to delete cast video.", "error");
    } finally {
      setBusy(false);
    }
  }

  function editNotice(notice: CastVideoNotice) {
    setForm({
      id: notice.id,
      title: notice.title,
      description: notice.description ?? "",
      priority: notice.priority,
      departments: notice.departments,
      allow_sound: notice.allow_sound,
      require_acknowledgement: notice.require_acknowledgement,
      auto_clear_mode: notice.auto_clear_mode,
      scheduled_at: toLocalDateTimeInput(notice.scheduled_at),
      video_storage_path: notice.video_storage_path,
      video_url: notice.video_url,
      thumbnail_storage_path: notice.thumbnail_storage_path,
      thumbnail_url: notice.thumbnail_url,
      mime_type: notice.mime_type,
      file_size_bytes: notice.file_size_bytes
    });
    setLocalPreviewUrl(null);
  }

  const previewSrc = localPreviewUrl ?? form.video_url;

  return (
    <div className="crossover-dashboard space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Cast Videos</h2>
          <p className="admin-page-subtitle">
            Upload and push full-screen management videos to targeted whiteboard displays. Landscape MP4 or WebM preferred.
          </p>
        </div>
        <button type="button" className="crossover-btn crossover-btn--outline" disabled={loading} onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {data?.activeNotice ? (
        <section className="crossover-card crossover-card--conversations border-amber-400/30 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">Live on displays</p>
              <h3 className="text-xl font-bold text-white">{data.activeNotice.title}</h3>
              <p className="text-sm text-admin-muted">
                Priority: {data.activeNotice.priority} • Queue: {data.queue.length}
              </p>
            </div>
            {canManage ? (
              <button type="button" className="crossover-btn crossover-btn--danger" disabled={busy} onClick={() => void clearActive(data.activeNotice!.id)}>
                <XCircle className="h-4 w-4" />
                Clear Live Video
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="crossover-card crossover-card--conversations p-5">
          <h3 className="crossover-card__title">Create Cast Video</h3>
          <p className="crossover-card__subtitle mb-5">MP4, WebM, or MOV up to 250MB. Thumbnail auto-generated on upload.</p>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Title</span>
              <input
                className="admin-input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="All-hands safety reminder"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Description (optional)</span>
              <textarea
                className="admin-input min-h-[88px]"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Short context for staff viewing the video."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-admin-muted">Priority</span>
                <select
                  className="admin-input"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value as CastVideoPriority })}
                >
                  {CAST_VIDEO_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-admin-muted">Auto clear</span>
                <select
                  className="admin-input"
                  value={form.auto_clear_mode}
                  onChange={(event) => setForm({ ...form, auto_clear_mode: event.target.value as CastVideoAutoClearMode })}
                >
                  {CAST_VIDEO_AUTO_CLEAR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Departments</span>
              <div className="flex flex-wrap gap-2">
                {CAST_VIDEO_DEPARTMENTS.map((department) => {
                  const active = form.departments.includes(department.value);
                  return (
                    <button
                      key={department.value}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-fitdog-orange bg-fitdog-orange/15 text-white" : "border-admin-border text-admin-muted"}`}
                      onClick={() => toggleDepartment(department.value)}
                    >
                      {department.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-admin-muted">
                <input
                  type="checkbox"
                  checked={form.allow_sound}
                  onChange={(event) => setForm({ ...form, allow_sound: event.target.checked })}
                />
                Allow sound ON/OFF on displays
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-admin-muted">
                <input
                  type="checkbox"
                  checked={form.require_acknowledgement}
                  onChange={(event) => setForm({ ...form, require_acknowledgement: event.target.checked })}
                />
                Require &quot;I&apos;ve Watched This&quot;
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-admin-muted">Schedule (optional)</span>
              <input
                type="datetime-local"
                className="admin-input"
                value={form.scheduled_at}
                onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}
              />
            </label>

            <div className="rounded-2xl border border-dashed border-admin-border p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadVideo(file);
                  event.currentTarget.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="crossover-btn crossover-btn--outline"
                  disabled={!canManage || busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Upload
                </button>
                <button
                  type="button"
                  className="crossover-btn crossover-btn--outline"
                  disabled={!previewSrc}
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
                {form.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.thumbnail_url} alt="" className="h-14 w-24 rounded-lg object-cover" />
                ) : null}
                {form.file_size_bytes ? (
                  <span className="text-sm text-admin-muted">
                    {(form.file_size_bytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="crossover-btn crossover-btn--outline" disabled={!canManage || busy} onClick={() => void saveDraft()}>
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              <button type="button" className="crossover-btn crossover-btn--primary" disabled={!canManage || busy} onClick={() => void pushNow()}>
                <Send className="h-4 w-4" />
                Push Now
              </button>
              <button type="button" className="crossover-btn crossover-btn--outline" disabled={!canManage || busy} onClick={() => void schedulePush()}>
                <CalendarClock className="h-4 w-4" />
                Schedule
              </button>
              {form.id ? (
                <button type="button" className="crossover-btn crossover-btn--danger" disabled={!canManage || busy} onClick={() => void deleteNotice(form.id!)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="crossover-card crossover-card--conversations p-5">
          <h3 className="crossover-card__title">Tracking</h3>
          <p className="crossover-card__subtitle mb-4">View engagement for recent pushes.</p>
          <div className="space-y-3">
            {(data?.notices ?? []).slice(0, 8).map((notice) => {
              const stats = data?.stats?.[notice.id];
              return (
                <article key={notice.id} className="rounded-xl border border-admin-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{notice.title}</p>
                      <p className="text-xs uppercase tracking-wide text-admin-muted">{notice.status}</p>
                    </div>
                    <Video className="h-4 w-4 shrink-0 text-fitdog-orange" />
                  </div>
                  {stats ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div><p className="text-lg font-bold text-white">{stats.viewed}</p><p className="text-admin-muted">Viewed</p></div>
                      <div><p className="text-lg font-bold text-white">{stats.pending}</p><p className="text-admin-muted">Pending</p></div>
                      <div><p className="text-lg font-bold text-white">{formatDuration(stats.average_watch_ms)}</p><p className="text-admin-muted">Avg watch</p></div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="crossover-card crossover-card--conversations p-5">
        <h3 className="crossover-card__title">Library</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-admin-muted">
                <th className="pb-3 pr-4">Title</th>
                <th className="pb-3 pr-4">Priority</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Departments</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.notices ?? []).map((notice) => (
                <tr key={notice.id} className="border-t border-admin-border/60">
                  <td className="py-3 pr-4 font-medium text-white">{notice.title}</td>
                  <td className="py-3 pr-4 capitalize">{notice.priority}</td>
                  <td className="py-3 pr-4 capitalize">{notice.status}</td>
                  <td className="py-3 pr-4">{notice.departments.join(", ")}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="crossover-btn crossover-btn--outline crossover-btn--sm" onClick={() => editNotice(notice)}>
                        Edit
                      </button>
                      {notice.status === "active" ? (
                        <button type="button" className="crossover-btn crossover-btn--outline crossover-btn--sm" onClick={() => void clearActive(notice.id)}>
                          Clear
                        </button>
                      ) : null}
                      <button type="button" className="crossover-btn crossover-btn--danger crossover-btn--sm" onClick={() => void deleteNotice(notice.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Video Preview">
        {previewSrc ? (
          <video src={previewSrc} controls className="w-full rounded-xl" poster={form.thumbnail_url ?? undefined} />
        ) : (
          <p className="text-admin-muted">Upload a video to preview.</p>
        )}
      </Modal>
    </div>
  );
}
