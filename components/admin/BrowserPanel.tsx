"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Home,
  Loader2,
  RefreshCw,
  Shield
} from "lucide-react";
import {
  buildBrowserProxyUrl,
  DEFAULT_BROWSER_BOOKMARKS,
  resolveBrowserNavigation,
  type BrowserBookmark
} from "@/lib/admin/browser";

type BrowseMode = "direct" | "proxy";

const HISTORY_KEY = "fitdog_browser_history";
const BOOKMARKS_KEY = "fitdog_browser_bookmarks";
const MODE_KEY = "fitdog_browser_mode";
const MAX_HISTORY = 40;

function readStoredHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStoredBookmarks(): BrowserBookmark[] {
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return DEFAULT_BROWSER_BOOKMARKS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_BROWSER_BOOKMARKS;
    return parsed.filter(
      (item): item is BrowserBookmark =>
        Boolean(item && typeof item === "object" && "id" in item && "label" in item && "url" in item)
    );
  } catch {
    return DEFAULT_BROWSER_BOOKMARKS;
  }
}

function readStoredMode(): BrowseMode {
  try {
    const raw = window.localStorage.getItem(MODE_KEY);
    return raw === "proxy" ? "proxy" : "direct";
  } catch {
    return "direct";
  }
}

function frameSrcFor(url: string, mode: BrowseMode): string {
  if (mode === "proxy" && /^https?:\/\//i.test(url)) {
    return buildBrowserProxyUrl(url);
  }
  return url;
}

export function BrowserPanel() {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [mode, setMode] = useState<BrowseMode>("direct");
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(DEFAULT_BROWSER_BOOKMARKS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setHistory(readStoredHistory());
    setBookmarks(readStoredBookmarks());
    setMode(readStoredMode());
  }, []);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const activeFrameSrc = useMemo(() => {
    if (!currentUrl) return undefined;
    return frameSrcFor(currentUrl, mode);
  }, [currentUrl, mode]);

  const persistHistory = useCallback((nextHistory: string[]) => {
    setHistory(nextHistory);
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory.slice(-MAX_HISTORY)));
    } catch {
      // ignore storage errors
    }
  }, []);

  const navigateTo = useCallback(
    (rawInput: string, options?: { replace?: boolean }) => {
      const resolved = resolveBrowserNavigation(rawInput, window.location.origin);
      if (!resolved) {
        setLoadError("Enter a valid website address (https://…) or internal path (/staff).");
        return;
      }

      setLoadError(null);
      setLoading(true);
      setCurrentUrl(resolved);
      setAddressValue(resolved);

      if (options?.replace && historyIndex >= 0) {
        const next = [...history];
        next[historyIndex] = resolved;
        persistHistory(next);
        return;
      }

      const truncated = history.slice(0, historyIndex + 1);
      const next = [...truncated, resolved];
      setHistoryIndex(next.length - 1);
      persistHistory(next);
    },
    [history, historyIndex, persistHistory]
  );

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current != null) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, []);

  const handleFrameLoad = useCallback(() => {
    clearLoadTimer();
    setLoading(false);
    setLoadError(null);
  }, [clearLoadTimer]);

  useEffect(() => {
    if (!activeFrameSrc) {
      setLoading(false);
      return;
    }

    clearLoadTimer();
    setLoading(true);
    loadTimerRef.current = window.setTimeout(() => {
      setLoading(false);
      setLoadError("This page is taking a while. Try Compatibility mode or open in a new tab.");
    }, 12_000);

    return clearLoadTimer;
  }, [activeFrameSrc, clearLoadTimer]);

  function goBack() {
    if (!canGoBack) return;
    const nextIndex = historyIndex - 1;
    const url = history[nextIndex];
    setHistoryIndex(nextIndex);
    setCurrentUrl(url);
    setAddressValue(url);
    setLoading(true);
    setLoadError(null);
  }

  function goForward() {
    if (!canGoForward) return;
    const nextIndex = historyIndex + 1;
    const url = history[nextIndex];
    setHistoryIndex(nextIndex);
    setCurrentUrl(url);
    setAddressValue(url);
    setLoading(true);
    setLoadError(null);
  }

  function reload() {
    if (!currentUrl) return;
    setLoading(true);
    setLoadError(null);
    if (iframeRef.current) {
      iframeRef.current.src = frameSrcFor(currentUrl, mode);
    }
  }

  function goHome() {
    setCurrentUrl(null);
    setAddressValue("");
    setLoading(false);
    setLoadError(null);
  }

  function toggleMode() {
    const next: BrowseMode = mode === "direct" ? "proxy" : "direct";
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore storage errors
    }
    if (currentUrl) {
      setLoading(true);
      setLoadError(null);
    }
  }

  function openExternal() {
    if (!currentUrl) return;
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    navigateTo(addressValue);
  }

  return (
    <div className="browser-panel">
      <div className="browser-panel__toolbar">
        <div className="browser-panel__nav">
          <button type="button" className="browser-panel__icon-btn" onClick={goBack} disabled={!canGoBack} title="Back" aria-label="Back">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="browser-panel__icon-btn" onClick={goForward} disabled={!canGoForward} title="Forward" aria-label="Forward">
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="browser-panel__icon-btn" onClick={reload} disabled={!currentUrl} title="Reload" aria-label="Reload">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button type="button" className="browser-panel__icon-btn" onClick={goHome} title="Home" aria-label="Home">
            <Home className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form className="browser-panel__address" onSubmit={handleSubmit}>
          <Globe className="browser-panel__address-icon h-4 w-4 shrink-0" aria-hidden />
          <input
            type="text"
            className="browser-panel__address-input"
            value={addressValue}
            onChange={(event) => setAddressValue(event.target.value)}
            placeholder="Search or enter a website address"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Address bar"
          />
          <button type="submit" className="browser-panel__go-btn">
            Go
          </button>
        </form>

        <div className="browser-panel__actions">
          <button
            type="button"
            className={`browser-panel__mode-btn ${mode === "proxy" ? "browser-panel__mode-btn--active" : ""}`}
            onClick={toggleMode}
            title={mode === "proxy" ? "Compatibility mode on" : "Compatibility mode off"}
          >
            <Shield className="h-4 w-4" aria-hidden />
            <span>{mode === "proxy" ? "Compat on" : "Compat off"}</span>
          </button>
          <button type="button" className="browser-panel__icon-btn" onClick={openExternal} disabled={!currentUrl} title="Open in new tab" aria-label="Open in new tab">
            <ExternalLink className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="browser-panel__bookmarks" aria-label="Bookmarks">
        {bookmarks.map((bookmark) => (
          <button
            key={bookmark.id}
            type="button"
            className="browser-panel__bookmark"
            onClick={() => navigateTo(bookmark.url)}
          >
            {bookmark.label}
          </button>
        ))}
      </div>

      {loadError ? <p className="browser-panel__notice">{loadError}</p> : null}

      <div className="browser-panel__viewport">
        {loading ? (
          <div className="browser-panel__loading" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Loading page…</span>
          </div>
        ) : null}

        {!currentUrl ? (
          <div className="browser-panel__start">
            <div className="browser-panel__start-icon" aria-hidden>
              <Globe className="h-10 w-10" />
            </div>
            <h2 className="browser-panel__start-title">Staff Browser</h2>
            <p className="browser-panel__start-copy">
              Browse the web without leaving the admin panel. Use bookmarks for quick access to Gingr, whiteboards, and common tools.
            </p>
            <p className="browser-panel__start-hint">
              If a site shows a blank page, turn on <strong>Compatibility mode</strong> or use Open in new tab.
            </p>
            <div className="browser-panel__start-grid">
              {bookmarks.map((bookmark) => (
                <button
                  key={`start-${bookmark.id}`}
                  type="button"
                  className="browser-panel__start-card"
                  onClick={() => navigateTo(bookmark.url)}
                >
                  <span>{bookmark.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={`${mode}:${activeFrameSrc}`}
            className="browser-panel__frame"
            src={activeFrameSrc}
            title="Staff browser"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-presentation"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={handleFrameLoad}
          />
        )}
      </div>
    </div>
  );
}
