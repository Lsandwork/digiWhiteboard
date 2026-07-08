import type { Metadata, Viewport } from "next";
import { DisplayBootstrap } from "@/components/display/DisplayBootstrap";

export const metadata: Metadata = {
  title: "Fitdog Cast Display",
  description: "Long-running TV display mode for Fitdog digital whiteboards.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fitdog Display"
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: "#02060b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default function DisplayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DisplayBootstrap />
      {children}
    </>
  );
}
