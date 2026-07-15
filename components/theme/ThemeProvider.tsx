"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { applyThemeToDocument } from "@/lib/theme/apply-theme";
import {
  DEFAULT_THEME,
  THEME_BROADCAST_CHANNEL,
  isThemeMode
} from "@/lib/theme/constants";
import { readLocalTheme, resolveInitialTheme, writeLocalTheme } from "@/lib/theme/storage";
import type { ThemeContextValue, ThemeMode } from "@/lib/theme/types";

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function fetchAccountTheme(): Promise<ThemeMode | null> {
  try {
    const response = await fetch("/api/admin/theme", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { theme?: unknown };
    return isThemeMode(body.theme) ? body.theme : null;
  } catch {
    return null;
  }
}

async function persistAccountTheme(theme: ThemeMode) {
  try {
    await fetch("/api/admin/theme", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ theme })
    });
  } catch {
    // keep local preference; silent retry on next change
  }
}

function readClientTheme(): ThemeMode {
  return resolveInitialTheme(readLocalTheme(), false);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [isHydrated, setIsHydrated] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const remoteLoadedRef = useRef(false);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    writeLocalTheme(next);
    applyThemeToDocument(next);
    channelRef.current?.postMessage({ type: "theme", theme: next });
    if (remoteLoadedRef.current) {
      void persistAccountTheme(next);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  useEffect(() => {
    const initial = readClientTheme();
    applyThemeToDocument(initial);

    const hydrateTimer = window.setTimeout(() => {
      setThemeState(initial);
      setIsHydrated(true);
    }, 0);

    void fetchAccountTheme().then((accountTheme) => {
      remoteLoadedRef.current = true;
      if (accountTheme) {
        setThemeState(accountTheme);
        writeLocalTheme(accountTheme);
        applyThemeToDocument(accountTheme);
      }
    });

    try {
      channelRef.current = new BroadcastChannel(THEME_BROADCAST_CHANNEL);
      channelRef.current.onmessage = (event: MessageEvent<{ type?: string; theme?: ThemeMode }>) => {
        if (event.data?.type === "theme" && isThemeMode(event.data.theme)) {
          setThemeState(event.data.theme);
          writeLocalTheme(event.data.theme);
          applyThemeToDocument(event.data.theme);
        }
      };
    } catch {
      channelRef.current = null;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== "fitdog_theme_preference" || !isThemeMode(event.newValue)) return;
      setThemeState(event.newValue);
      applyThemeToDocument(event.newValue);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener("storage", onStorage);
      channelRef.current?.close();
    };
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isHydrated
    }),
    [theme, setTheme, toggleTheme, isHydrated]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export function useThemeOptional() {
  return useContext(ThemeContext);
}
