"use client";

import { useState } from "react";
import Image from "next/image";
import { PawPrint, RefreshCw } from "lucide-react";
import { OpsAlertCard } from "@/components/ops-alert/OpsAlertCard";
import { formatBoardTime } from "@/lib/board-utils";
import type { OpsAlertViewModel } from "@/lib/ops-alert/types";
import styles from "@/components/ops-alert/OpsAlert.module.css";

type ConnectionState = "connecting" | "live" | "polling" | "offline";

type OpsAlertBoardProps = {
  alert: OpsAlertViewModel;
  clockTime?: string;
  clockDate?: string;
  lastUpdated?: string;
  connection?: ConnectionState;
  lowMotion?: boolean;
  /** card = alert only; full = approved board chrome + alert */
  layout?: "full" | "card";
  fullscreen?: boolean;
  compact?: boolean;
};

function LiveBlock({ connection }: { connection: ConnectionState }) {
  const healthy = connection === "live" || connection === "polling";
  const label = connection === "offline" ? "OFFLINE" : connection === "connecting" ? "CONNECTING" : "LIVE";

  return (
    <div className={styles.statusStack}>
      <div className={styles.livePill}>
        <span className={styles.liveDot} aria-hidden />
        <span className={styles.liveLabel}>{label}</span>
      </div>
      <div className={styles.boardActive}>
        <span className={styles.boardActiveDot} aria-hidden />
        <span>{healthy ? "Board active" : connection === "connecting" ? "Connecting…" : "Sync unavailable"}</span>
      </div>
    </div>
  );
}

export function OpsAlertBoard({
  alert,
  clockTime = "--:--",
  clockDate = "LOADING",
  lastUpdated,
  connection = "polling",
  lowMotion = false,
  layout = "full",
  fullscreen = true,
  compact = false
}: OpsAlertBoardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  if (layout === "card") {
    return <OpsAlertCard alert={alert} fullscreen={fullscreen} compact={compact} lowMotion={lowMotion} />;
  }

  return (
    <div className={`${styles.board} ${lowMotion ? styles.boardLowMotion : ""}`} data-ops-alert-board={alert.id}>
      <header className={styles.boardHeader}>
        <div className={styles.brandBlock}>
          <div className={styles.logoWrap}>
            {logoFailed ? (
              <span className={styles.logoFallback}>F</span>
            ) : (
              <Image
                src="/assets/fitdog/replace_f-logo.png"
                alt="Fitdog Team"
                width={224}
                height={224}
                priority
                className={styles.logo}
                draggable={false}
                onError={() => setLogoFailed(true)}
              />
            )}
          </div>
          <div className={styles.brandCopy}>
            <h1 className={styles.brandTitle}>Fitdog Health & Social Club</h1>
            <p className={styles.brandSubtitle}>Real-Time Operations Board</p>
          </div>
        </div>
        <LiveBlock connection={connection} />
      </header>

      <div className={styles.timeRow}>
        <div className={styles.timeBlock}>
          <p className={styles.clockTime}>{clockTime}</p>
          <p className={styles.lastUpdated}>
            <RefreshCw aria-hidden size={16} />
            <span>Last updated {formatBoardTime(lastUpdated ?? new Date().toISOString())}</span>
          </p>
        </div>
        <div className={styles.dateDivider} aria-hidden />
        <p className={styles.clockDate}>{clockDate}</p>
      </div>

      <section className={styles.stage} aria-label={alert.alertType}>
        <OpsAlertCard alert={alert} fullscreen={fullscreen} compact={compact} lowMotion={lowMotion} />
      </section>

      <footer className={styles.boardFooter}>
        <PawPrint className={styles.boardFooterPaw} aria-hidden />
        <span>Thank you for trusting us with your pups!</span>
        <PawPrint className={styles.boardFooterPaw} aria-hidden />
      </footer>
    </div>
  );
}
