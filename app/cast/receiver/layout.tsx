import type { Metadata, Viewport } from "next";
import { DisplayBootstrap } from "@/components/display/DisplayBootstrap";

export const metadata: Metadata = {
  title: "Fitdog Remote Whiteboard Cast",
  description: "Paired remote digital whiteboard receiver for Fitdog lobby and staff displays.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Fitdog Remote Cast"
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

export default function RemoteCastReceiverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DisplayBootstrap />
      {children}
    </>
  );
}
