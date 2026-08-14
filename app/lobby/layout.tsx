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
  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Montserrat:wght@700;800;900&display=swap"
      />
      <div
        className="lobby-root lobby-root--light"
        style={
          {
            "--font-lobby-display": '"Montserrat", sans-serif',
            "--font-lobby-script": '"Caveat", cursive'
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </>
  );
}
