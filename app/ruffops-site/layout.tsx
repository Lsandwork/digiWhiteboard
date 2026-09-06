import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { SiteFooter } from "@/components/ruffops-site/SiteFooter";
import { SiteHeader } from "@/components/ruffops-site/SiteHeader";
import { SITE } from "@/lib/ruffops-site/config";
import "./ruffops-site.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-ro-display",
  display: "swap",
  weight: ["600", "700", "800"]
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ro-body",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} | Operations Platform & Custom Kiosk Whiteboards`,
    template: `%s | ${SITE.name}`
  },
  description: SITE.description,
  metadataBase: new URL(SITE.url),
  openGraph: {
    siteName: SITE.name,
    type: "website",
    locale: "en_US",
    title: `${SITE.name} | Operations Platform & Custom Kiosk Whiteboards`,
    description: SITE.description
  }
};

export default function RuffopsSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`ruffops-site ${display.variable} ${body.variable} min-h-screen bg-ro-950 text-slate-200 antialiased`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ro-accent focus:px-4 focus:py-2 focus:text-ro-950"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
