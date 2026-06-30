import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fitdog Health & Social Club",
  description: "Live Fitdog board for dogs actively checking in or checking out.",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#02060b",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
