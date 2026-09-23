"use client";

import { useLayoutEffect, useState } from "react";
import { isTvDisplayBrowser } from "@/lib/display-tv-layout";

/** Google Streamer / Android TV / Chromecast Internet apps should use TV canvas even without ?display=tv. */
export function useTvDisplayBrowser() {
  const [tvBrowser, setTvBrowser] = useState(false);

  useLayoutEffect(() => {
    setTvBrowser(isTvDisplayBrowser(window));
  }, []);

  return tvBrowser;
}
