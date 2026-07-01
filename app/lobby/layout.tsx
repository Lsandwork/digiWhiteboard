import type { Metadata } from "next";
import { lobbyAssets } from "@/lib/lobby/assets";

export const metadata: Metadata = {
  title: "Fitdog Lobby Checkout Board",
  description: "Lobby display for dogs currently checking out at Fitdog Health & Social Club.",
  icons: {
    icon: lobbyAssets.appIcon192,
    apple: lobbyAssets.appIcon192
  }
};

export default function LobbyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="lobby-root">{children}</div>;
}
