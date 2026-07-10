import type { Metadata } from "next";
import { DisplayBootstrap } from "@/components/display/DisplayBootstrap";

export const metadata: Metadata = {
  title: "Fitdog Staff Cast Display",
  description: "Chromecast-optimized cast mode for the Fitdog Staff Digital Whiteboard."
};

export default function StaffCastLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DisplayBootstrap />
      {children}
    </>
  );
}
