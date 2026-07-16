"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ExternalLink, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { GINGR_EMPLOYEE_URL, GINGR_NAV_ICON } from "@/lib/gingr/constants";

type GingrWorkspaceProps = {
  embedAllowed: boolean;
  embedBlockReason?: string | null;
};

export function GingrWorkspace({ embedAllowed, embedBlockReason }: GingrWorkspaceProps) {
  const [status, setStatus] = useState<"loading" | "loaded">("loading");
  const showIframe = embedAllowed;

  const refreshIframe = useCallback(() => {
    const iframe = document.getElementById("gingr-iframe") as HTMLIFrameElement | null;
    if (!iframe) return;
    setStatus("loading");
    iframe.src = GINGR_EMPLOYEE_URL;
  }, []);

  return (
    <section className="gingr-workspace">
      <header className="gingr-toolbar">
        <div className="gingr-toolbar__title">
          <Image src={GINGR_NAV_ICON} alt="" width={28} height={28} className="gingr-toolbar__logo" />
          <div>
            <h1>Gingr</h1>
            <p>Fitdog reservation and pet management</p>
          </div>
        </div>

        <div className="gingr-toolbar-actions">
          {showIframe ? (
            <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={refreshIframe}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </button>
          ) : null}

          <a
            href={GINGR_EMPLOYEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn-primary inline-flex items-center gap-2"
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            {showIframe ? "Open separately" : "Open Gingr Securely"}
          </a>
        </div>
      </header>

      <div className="gingr-frame-shell">
        {!showIframe ? (
          <div className="gingr-fallback" role="status">
            <div className="gingr-fallback__icon" aria-hidden="true">
              <ShieldAlert className="h-10 w-10" />
            </div>
            <h2>Gingr could not be embedded in this page</h2>
            <p>
              Gingr could not be displayed inside this page because of Gingr or browser security settings. Open Gingr
              securely in a separate tab to continue.
            </p>
            {embedBlockReason ? <p className="gingr-fallback__detail">{embedBlockReason}</p> : null}
            <a
              href={GINGR_EMPLOYEE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn-primary gingr-fallback__cta inline-flex items-center gap-2"
            >
              <ExternalLink aria-hidden="true" className="h-5 w-5" />
              Open Gingr Securely
            </a>
          </div>
        ) : (
          <>
            {status === "loading" ? (
              <div className="gingr-loading" aria-live="polite">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                <span>Loading Gingr…</span>
              </div>
            ) : null}

            <iframe
              id="gingr-iframe"
              src={GINGR_EMPLOYEE_URL}
              title="Gingr employee application"
              className="gingr-frame"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="clipboard-read; clipboard-write; fullscreen"
              onLoad={() => setStatus("loaded")}
            />
          </>
        )}
      </div>
    </section>
  );
}
