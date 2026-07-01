import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fitdog Lobby Checkout Board",
  description: "Lobby display for dogs currently checking out at Fitdog Health & Social Club."
};

export default function LobbyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="lobby-root">{children}</div>;
}
