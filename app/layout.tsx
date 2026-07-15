import type { Metadata, Viewport } from "next";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/boot-script";
import "./globals.css";
import "../lib/theme/tokens.css";
import "../lib/fitdog-dashboard/theme.css";
import "../lib/fitdog-dashboard/theme-light.css";
import "../lib/theme/button-states.css";

export const metadata: Metadata = {
  title: "Fitdog Health & Social Club",
  description: "Live Fitdog board for dogs actively checking in or checking out.",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#02060b" }
  ],
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ChunkLoadRecovery />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
