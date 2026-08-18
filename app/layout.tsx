import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { RuffOpsConsoleSignature } from "@/components/branding/RuffOpsConsoleSignature";
import { RuffOpsSourceSignature } from "@/components/branding/RuffOpsSourceSignature";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { RUFFOPS_META } from "@/lib/branding/ruffops-signature";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/boot-script";
import { TV_HARD_REFRESH_BOOT_SCRIPT } from "@/lib/tv-hard-refresh-boot-script";
import "./globals.css";
import "../lib/theme/tokens.css";
import "../lib/fitdog-dashboard/theme.css";
import "../lib/fitdog-dashboard/theme-light.css";
import "../lib/fitdog-dashboard/theme-clear.css";
import "../lib/fitdog-dashboard/theme-readable-canvas.css";
import "../lib/theme/button-states.css";

export const metadata: Metadata = {
  title: "Fitdog Health & Social Club",
  description: "Live Fitdog board for dogs actively checking in or checking out.",
  applicationName: RUFFOPS_META.applicationName,
  generator: RUFFOPS_META.generator,
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f9fc" },
    { media: "(prefers-color-scheme: dark)", color: "#02060b" }
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-platform="ruffops" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TV_HARD_REFRESH_BOOT_SCRIPT }} />
        <RuffOpsSourceSignature />
      </head>
      <body data-ruffops="operations-platform">
        <ChunkLoadRecovery />
        <RuffOpsConsoleSignature />
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
