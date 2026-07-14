import type { Metadata } from "next";
import { Caveat, Montserrat } from "next/font/google";
import { lobbyAssets } from "@/lib/lobby/assets";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-lobby-display",
  display: "swap"
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-lobby-script",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Fitdog Lobby Checkout Board",
  description: "Lobby display for dogs currently checking out at Fitdog Health & Social Club.",
  icons: {
    icon: lobbyAssets.appIcon192,
    apple: lobbyAssets.appIcon192
  }
};

export default function LobbyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`lobby-root lobby-root--light ${montserrat.variable} ${caveat.variable}`}>{children}</div>;
}
