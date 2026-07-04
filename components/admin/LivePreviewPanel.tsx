"use client";

import { Maximize2 } from "lucide-react";
import Image from "next/image";
import type { AdminBoardType } from "@/lib/admin/types";
import type { LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";
import type { LobbyPromotion } from "@/lib/lobby/types";
import type { LiveDog } from "@/lib/types";

type LivePreviewPanelProps = {
  board: AdminBoardType;
  lobbySettings: LobbySettings;
  staffSettings: StaffBoardSettings;
  promotions: LobbyPromotion[];
  staffDogs: LiveDog[];
  activeCheckouts: number;
  onFullscreen?: () => void;
};

export function LivePreviewPanel({ board, lobbySettings, staffSettings, promotions, staffDogs, activeCheckouts, onFullscreen }: LivePreviewPanelProps) {
  const featuredPromotion = promotions.find((p) => p.active) ?? promotions[0];
  const checkoutDogs = staffDogs.filter((d) => d.display_status === "checking_out").slice(0, 3);

  return (
    <section className="admin-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-admin-border px-4 py-3">
        <h2 className="font-black text-white">Live Preview</h2>
        <span className="admin-badge admin-badge--green">LIVE</span>
      </div>

      <div className="p-4">
        <div className={`admin-preview-frame ${board === "lobby" ? "admin-preview-frame--lobby" : "admin-preview-frame--staff"}`}>
          {board === "lobby" ? (
            <>
              <div className="flex items-center gap-2">
                <Image src="/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png" alt="" width={24} height={24} className="rounded-full" />
                <p className="text-[10px] text-white/80">{lobbySettings.lobby_message}</p>
              </div>
              {activeCheckouts > 0 ? <p className="mt-2 text-xs font-black uppercase text-white">Now Checking Out</p> : null}
              <div className="mt-2 space-y-1">
                {(checkoutDogs.length ? checkoutDogs : [{ animal_name: "Bella" }, { animal_name: "Charlie" }, { animal_name: "Cooper" }] as Partial<LiveDog>[]).map((dog, i) => (
                  <div key={i} className="rounded bg-white/10 px-2 py-1 text-[10px] text-white">{dog.animal_name}</div>
                ))}
              </div>
              {featuredPromotion ? (
                <div className="mt-3 rounded-lg bg-fitdog-orange/20 p-2">
                  <p className="text-[10px] font-bold text-white">{featuredPromotion.title}</p>
                  <p className="text-[9px] text-white/70">{featuredPromotion.subtitle}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-xs font-black text-white">Staff Digital Whiteboard</p>
              <div className="mt-2 rounded bg-white/10 p-2 text-[10px] text-white/85">{staffSettings.team_reminder}</div>
              <div className="mt-2 rounded bg-emerald-500/15 p-2 text-[10px] text-emerald-100">{staffSettings.important_notice}</div>
              <p className="mt-2 text-[10px] font-bold uppercase text-fitdog-orange">Checking Out ({activeCheckouts})</p>
              <div className="mt-1 space-y-1">
                {staffDogs.filter((d) => d.display_status === "checking_out").slice(0, 4).map((dog) => (
                  <div key={dog.id} className="rounded bg-white/10 px-2 py-1 text-[10px] text-white">{dog.animal_name}</div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-admin-muted">
          <span>{board === "lobby" ? "Lobby TV 1" : "Staff Display 1"}</span>
          <span>1920 × 1080</span>
          {onFullscreen ? (
            <button type="button" className="admin-icon-btn" aria-label="Open fullscreen preview" onClick={onFullscreen}>
              <Maximize2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
