"use client";

import Image from "next/image";
import { lobbyLightAssets } from "@/lib/lobby/assets";

const VALUES = [
  {
    icon: lobbyLightAssets.shieldValue,
    title: "Safe, Loving Environment",
    copy: "Always our top priority."
  },
  {
    icon: lobbyLightAssets.pawOutlineTeal,
    title: "Enrichment Every Day",
    copy: "Stimulated body & happy mind."
  },
  {
    icon: lobbyLightAssets.heartOrange,
    title: "Expert Care. Happy Dogs.",
    copy: "Trained team. Happy tails."
  },
  {
    icon: lobbyLightAssets.checkValue,
    title: "Healthy Minds. Happy Tails.",
    copy: "Play. Exercise. Balance."
  }
] as const;

export function LobbyValuesFooter({ footerMessage }: { footerMessage?: string | null }) {
  return (
    <footer className="lobby-values-footer">
      <div className="lobby-values-footer__wave" aria-hidden />
      <div className="lobby-values-footer__inner">
        <ul className="lobby-values-footer__list">
          {VALUES.map((value) => (
            <li key={value.title} className="lobby-values-footer__item">
              <span className="lobby-values-footer__icon">
                <Image src={value.icon} alt="" width={40} height={40} className="h-9 w-9 object-contain" unoptimized />
              </span>
              <div>
                <p className="lobby-values-footer__title">{value.title}</p>
                <p className="lobby-values-footer__copy">{value.copy}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="lobby-values-footer__love">
          {footerMessage?.trim() || "We love your dogs like our own."}
          <Image
            src={lobbyLightAssets.heartOrange}
            alt=""
            width={28}
            height={28}
            className="ml-2 inline-block h-6 w-6 object-contain align-middle"
            unoptimized
          />
        </p>
      </div>
    </footer>
  );
}
