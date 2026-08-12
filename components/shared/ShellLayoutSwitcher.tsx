"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveShellLayout } from "@/lib/shell-layout/apply";
import type { ShellLayoutMode } from "@/lib/shell-layout/constants";
import { SHELL_LAYOUT_PHONE_MQ } from "@/lib/shell-layout/constants";
import { readLocalShellLayout, writeLocalShellLayout } from "@/lib/shell-layout/storage";

type Props = {
  className?: string;
};

export function ShellLayoutSwitcher({ className }: Props) {
  const [mode, setMode] = useState<ShellLayoutMode>("desktop");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setMode(resolveShellLayout(readLocalShellLayout()));
      setReady(true);
    };

    sync();

    const mq = window.matchMedia(SHELL_LAYOUT_PHONE_MQ);
    const onChange = () => {
      if (!readLocalShellLayout()) sync();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const current = resolveShellLayout(readLocalShellLayout());
    const next: ShellLayoutMode = current === "mobile" ? "desktop" : "mobile";
    writeLocalShellLayout(next);
    // Reload so the boot script applies the viewport before first paint.
    window.location.reload();
  }

  if (!ready) {
    return (
      <div className={`shell-layout-switcher${className ? ` ${className}` : ""}`} aria-hidden>
        <span className="shell-layout-switcher__placeholder" />
      </div>
    );
  }

  const toMobile = mode === "desktop";
  const Icon = toMobile ? Smartphone : Monitor;
  const label = toMobile ? "Switch to Mobile App" : "Switch to Desktop";

  return (
    <div className={`shell-layout-switcher${className ? ` ${className}` : ""}`}>
      <button type="button" className="shell-layout-switcher__btn" onClick={toggle}>
        <Icon size={16} strokeWidth={2.25} aria-hidden />
        <span>{label}</span>
      </button>
    </div>
  );
}
