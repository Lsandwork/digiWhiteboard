import type { Metadata } from "next";
import { TL_BOARD_BRAND } from "@/lib/tl-digi-board/brand";

export const metadata: Metadata = {
  title: "Team Lead Alerts + Reminders",
  description: "Fitdog Team Lead digital whiteboard for medications, services, and daily reminders.",
  icons: {
    icon: TL_BOARD_BRAND.favicon,
    apple: TL_BOARD_BRAND.favicon,
    shortcut: TL_BOARD_BRAND.favicon
  }
};

export default function TlAlertsRemindersLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
