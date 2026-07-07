import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Fitdog Cast Display",
  description: "Long-running TV display mode for Fitdog digital whiteboards."
};

export const viewport: Viewport = {
  themeColor: "#02060b",
  width: "device-width",
  initialScale: 1
};

export default function DisplayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
