import type { Metadata } from "next";
import { DisplayBootstrap } from "@/components/display/DisplayBootstrap";

export const metadata: Metadata = {
  title: "Fitdog Lobby Cast Display",
  description: "Lightweight cast mode for the Fitdog Lobby Digital Whiteboard."
};

export default function LobbyCastLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <DisplayBootstrap />
      {children}
    </>
  );
}
