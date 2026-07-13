"use client";

import { useState } from "react";
import { Camera, Clock3, MapPin } from "lucide-react";
import {
  buildStaffNoticeMessage,
  destinationLabel,
  staffNoticeTitle,
  type MarketingMediaRequest
} from "@/lib/marketing/media-requests";
import { MARKETING_REQUEST_TYPE_LABELS } from "@/lib/marketing/constants";
import { MarketingStatusBadge } from "@/components/marketing/MarketingStatusBadge";

const STAFF_ACTIONS = [
  { action: "acknowledge", label: "Acknowledge" },
  { action: "dog_being_retrieved", label: "Dog Being Retrieved" },
  { action: "dog_ready", label: "Dog Is Ready" },
  { action: "delay_5_minutes", label: "Delay 5 Minutes" },
  { action: "dog_unavailable", label: "Dog Is Not Available" },
  { action: "contact_marketing", label: "Contact Marketing" }
] as const;

export function MediaRequestOverlay({
  request,
  queue,
  onAction,
  busy
}: {
  request: MarketingMediaRequest;
  queue: MarketingMediaRequest[];
  onAction: (requestId: string, action: string) => Promise<void>;
  busy?: boolean;
}) {
  const [localBusy, setLocalBusy] = useState(false);
  const message = buildStaffNoticeMessage(request);

  async function run(action: string) {
    setLocalBusy(true);
    try {
      await onAction(request.id, action);
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <section className="grooming-push grooming-push--alerting media-request-overlay" role="alert" aria-live="assertive">
      <header className="grooming-push__header">
        <div>
          <p className="grooming-push__eyebrow">Marketing Request</p>
          <h2 className="grooming-push__title">{staffNoticeTitle(request)}</h2>
        </div>
        <MarketingStatusBadge status={request.status} />
      </header>

      <div className="grooming-push__body">
        <div className="grooming-push__photo">
          {request.dog_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={request.dog_photo_url} alt={request.dog_name} className="grooming-push__photo-img" />
          ) : (
            <div className="grooming-push__photo-fallback">{request.dog_name.charAt(0)}</div>
          )}
        </div>
        <div className="grooming-push__details">
          <p><Camera size={16} className="inline" /> {MARKETING_REQUEST_TYPE_LABELS[request.request_type]}</p>
          <p><MapPin size={16} className="inline" /> {destinationLabel(request.destination, request.custom_destination)}</p>
          {request.requested_deadline ? (
            <p><Clock3 size={16} className="inline" /> Deadline {new Date(request.requested_deadline).toLocaleString()}</p>
          ) : null}
          <pre className="whitespace-pre-wrap text-sm">{message}</pre>
          {request.delay_until ? (
            <p className="text-amber-700">Reminder after {new Date(request.delay_until).toLocaleTimeString()}</p>
          ) : null}
        </div>
      </div>

      <div className="grooming-push__actions flex flex-wrap gap-2 p-4">
        {STAFF_ACTIONS.map((item) => (
          <button
            key={item.action}
            type="button"
            className="marketing-btn marketing-btn--primary"
            disabled={busy || localBusy}
            onClick={() => void run(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {queue.length ? (
        <div className="border-t p-4">
          <p className="mb-2 text-sm font-semibold">Queued requests</p>
          <ul className="space-y-1 text-sm">
            {queue.map((item) => (
              <li key={item.id}>{item.dog_name} · {MARKETING_REQUEST_TYPE_LABELS[item.request_type]}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
