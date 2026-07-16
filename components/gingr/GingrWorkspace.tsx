"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { GINGR_EMPLOYEE_URL, GINGR_NAV_ICON } from "@/lib/gingr/constants";
import { openGingrSecurely } from "@/lib/gingr/open-gingr";

type GingrWorkspaceProps = {
  embedAllowed: boolean;
};

export function GingrWorkspace({ embedAllowed }: GingrWorkspaceProps) {
  const [status, setStatus] = useState<"loading" | "loaded">("loading");

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
          {embedAllowed ? (
            <button type="button" className="admin-btn-secondary inline-flex items-center gap-2" onClick={refreshIframe}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </button>
          ) : null}

          <button
            type="button"
            className="admin-btn-primary inline-flex items-center gap-2"
            onClick={() => openGingrSecurely()}
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            {embedAllowed ? "Open separately" : "Open Gingr Securely"}
          </button>
        </div>
      </header>

      <div className="gingr-frame-shell">
        {!embedAllowed ? (
          <div className="gingr-launch" role="region" aria-label="Open Gingr">
            <div className="gingr-launch__brand" aria-hidden="true">
              <Image src={GINGR_NAV_ICON} alt="" width={72} height={72} className="gingr-launch__logo" />
            </div>
            <h2>Open Gingr in a secure tab</h2>
            <p>
              Gingr runs in its own browser tab so you can log in, manage reservations, view customer and pet profiles,
              use schedules, upload files, and open reports with full functionality.
            </p>
            <p className="gingr-launch__note">
              Use the Applications menu anytime to return here. Your Digital Whiteboards stay fast and unaffected.
            </p>
            <button
              type="button"
              className="admin-btn-primary gingr-launch__cta inline-flex items-center gap-2"
              onClick={() => openGingrSecurely()}
            >
              <ExternalLink aria-hidden="true" className="h-5 w-5" />
              Open Gingr Securely
            </button>
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
