"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import {
  STAFF_WHITEBOARD_THEME_LIST,
  type StaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-themes";

type StaffWhiteboardThemeSelectorProps = {
  selectedThemeId: StaffWhiteboardThemeId;
  saving?: boolean;
  onSelect: (themeId: StaffWhiteboardThemeId) => void;
};

export function StaffWhiteboardThemeSelector({
  selectedThemeId,
  saving = false,
  onSelect
}: StaffWhiteboardThemeSelectorProps) {
  return (
    <section className="admin-card overflow-hidden">
      <div className="border-b border-admin-border px-4 py-3">
        <h2 className="font-black uppercase tracking-wide text-white">Whiteboard Theme</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Choose how the Staff Digital Whiteboard appears on screens.
        </p>
      </div>

      <div className="p-4">
        <div className="staff-wb-theme-grid" role="listbox" aria-label="Staff whiteboard themes">
          {STAFF_WHITEBOARD_THEME_LIST.map((theme) => {
            const selected = theme.id === selectedThemeId;
            return (
              <button
                key={theme.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={saving}
                className={`staff-wb-theme-card ${selected ? "is-selected" : ""}`}
                onClick={() => {
                  if (!selected) onSelect(theme.id);
                }}
              >
                <div className="staff-wb-theme-card__preview">
                  <Image
                    src={theme.previewImage}
                    alt={`${theme.name} theme preview`}
                    fill
                    sizes="(max-width: 900px) 100vw, 420px"
                    className="object-cover"
                    priority={theme.id === "clear-white"}
                  />
                </div>
                <div className="staff-wb-theme-card__meta">
                  <span className="staff-wb-theme-card__name">{theme.name}</span>
                  <span className="staff-wb-theme-card__desc">{theme.shortDescription}</span>
                  <span className="staff-wb-theme-card__action">
                    {selected ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Current Theme
                      </>
                    ) : (
                      "Use This Theme"
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
