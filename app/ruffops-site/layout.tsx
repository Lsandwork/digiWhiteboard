import type { Metadata } from "next";
import { SiteFooter } from "@/components/ruffops-site/SiteFooter";
import { SiteHeader } from "@/components/ruffops-site/SiteHeader";
import { SITE } from "@/lib/ruffops-site/config";
import "./ruffops-site.css";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} | Pet Business Consulting in Santa Monica, CA + AI Operations Nationwide`,
    template: `%s | ${SITE.name}`
  },
  description: SITE.description,
  metadataBase: new URL(SITE.url),
  openGraph: {
    siteName: SITE.name,
    type: "website",
    locale: "en_US"
  }
};

export default function RuffopsSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ruffops-site min-h-screen bg-ro-950 font-sans text-slate-200 antialiased">
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
