import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./owner-track.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--owner-track-font"
});

export const metadata: Metadata = {
  title: "Track your Fitdog ride",
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#f15f2a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function OwnerTrackLayout({ children }: { children: React.ReactNode }) {
  return <div className={sora.variable}>{children}</div>;
}
