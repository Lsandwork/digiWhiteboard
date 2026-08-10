"use client";

import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  Clock3,
  Dog,
  MapPin,
  Tag,
  UserRound,
  Users,
  TriangleAlert
} from "lucide-react";
import type { OpsAlertMetaRow, OpsAlertViewModel } from "@/lib/ops-alert/types";
import styles from "@/components/ops-alert/OpsAlert.module.css";

type OpsAlertCardProps = {
  alert: OpsAlertViewModel;
  fullscreen?: boolean;
  compact?: boolean;
  lowMotion?: boolean;
};

function MetaIcon({ icon }: { icon?: OpsAlertMetaRow["icon"] }) {
  if (icon === "users") return <Users aria-hidden />;
  if (icon === "user") return <UserRound aria-hidden />;
  if (icon === "tag") return <Tag aria-hidden />;
  if (icon === "dog") return <Dog aria-hidden />;
  if (icon === "map") return <MapPin aria-hidden />;
  return <Clock3 aria-hidden />;
}

function accentClass(accent: OpsAlertViewModel["accent"]) {
  if (accent === "amber") return styles.cardAccentAmber;
  if (accent === "orange") return styles.cardAccentOrange;
  if (accent === "red") return styles.cardAccentRed;
  if (accent === "green") return styles.cardAccentGreen;
  return styles.cardAccentBlue;
}

function ActionIcon({ action }: { action: OpsAlertViewModel["action"] }) {
  if (action === "completed" || action === "done") return <CheckCircle2 aria-hidden />;
  if (action === "urgent_action") return <TriangleAlert aria-hidden />;
  if (action === "acknowledge") return <Check aria-hidden />;
  return <AlertTriangle aria-hidden />;
}

export function OpsAlertCard({ alert, fullscreen = false, compact = false, lowMotion = false }: OpsAlertCardProps) {
  const className = [
    styles.card,
    accentClass(alert.accent),
    fullscreen ? styles.cardFullscreen : "",
    compact ? styles.cardCompact : "",
    lowMotion ? styles.cardLowMotion : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={className} role="alert" aria-live="assertive" data-ops-alert={alert.id}>
      <div className={styles.iconWrap} aria-hidden="true">
        {alert.accent === "green" ? <CheckCircle2 /> : alert.alertType.includes("REMINDER") ? <BellRing /> : <BellRing />}
      </div>

      <p className={styles.alertType}>{alert.alertType}</p>
      <h2 className={styles.title}>{alert.title}</h2>
      {alert.subtitle ? <p className={styles.subtitle}>{alert.subtitle}</p> : null}

      {alert.mediaUrl ? (
        <div className={styles.media}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={alert.mediaUrl} alt={alert.mediaAlt ?? alert.title} loading="lazy" decoding="async" />
        </div>
      ) : null}

      {alert.metaRows.length ? (
        <div className={styles.metaList}>
          {alert.metaRows.map((row) => (
            <div className={styles.metaRow} key={`${row.label}-${row.value}`}>
              <span className={styles.metaIcon}>
                <MetaIcon icon={row.icon} />
              </span>
              <div className={styles.metaCopy}>
                <span className={styles.metaLabel}>{row.label}:</span>
                <span className={styles.metaValue}>{row.value}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {alert.checklistItems.length ? (
        <ul className={styles.checklist}>
          {alert.checklistItems.map((item) => (
            <li className={styles.checklistItem} key={item}>
              <span className={styles.checkIcon}>
                <Check aria-hidden />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {alert.message ? <p className={styles.message}>{alert.message}</p> : null}
      {alert.note ? <p className={styles.note}>{alert.note}</p> : null}

      {alert.action !== "none" && alert.actionLabel ? (
        <div className={styles.actionBar}>
          <ActionIcon action={alert.action} />
          <span>{alert.actionLabel}</span>
        </div>
      ) : null}

      {alert.expirationTime ? (
        <p className={styles.expires}>
          <Clock3 aria-hidden />
          <span>Expires {alert.expirationTime}</span>
        </p>
      ) : null}

      {alert.footer ? <p className={styles.cardFooter}>{alert.footer}</p> : null}
    </article>
  );
}
