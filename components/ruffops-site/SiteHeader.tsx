"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Hexagon, Menu, PawPrint } from "lucide-react";
import { NAV, PRIMARY_CTA, SITE } from "@/lib/ruffops-site/config";
import { SiteLink, isMarketingNavActive } from "@/components/ruffops-site/SiteLink";

function Logo() {
  return (
    <SiteLink href="/" className="group inline-flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ro-line bg-ro-700/70 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_18px_60px_-25px_rgba(56,189,248,0.45)]">
        <Hexagon className="absolute h-9 w-9 text-ro-electric/30" strokeWidth={1.2} />
        <PawPrint className="h-4 w-4 text-ro-accent" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight text-white">{SITE.name}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ro-electric/80">{SITE.lockup}</span>
      </span>
    </SiteLink>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => isMarketingNavActive(pathname || "/", href);

  return (
    <header
      className={`relative sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-ro-line bg-ro-950/85 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 xl:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(item.href) ? "text-white" : "text-slate-400 hover:bg-ro-700/50 hover:text-white"
              }`}
            >
              {item.label}
            </SiteLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 xl:flex">
          <a href={SITE.clientLoginHref} className="btn-secondary text-sm">
            Client Login
          </a>
          <SiteLink href={PRIMARY_CTA.href} className="btn-primary text-sm">
            {PRIMARY_CTA.label}
            <ArrowRight className="h-4 w-4" />
          </SiteLink>
        </div>
        <details className="xl:hidden">
          <summary className="inline-flex h-10 w-10 list-none items-center justify-center rounded-lg border border-ro-line bg-ro-700/60 text-white [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Menu</span>
            <Menu className="h-5 w-5" />
          </summary>
          <div className="absolute left-0 right-0 top-16 border-t border-ro-line bg-ro-950/95 backdrop-blur-xl">
            <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-4">
              {NAV.map((item) => (
                <SiteLink
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-3 text-base font-medium transition ${
                    isActive(item.href) ? "bg-ro-700/60 text-white" : "text-slate-300 hover:bg-ro-700/50 hover:text-white"
                  }`}
                >
                  {item.label}
                </SiteLink>
              ))}
              <a href={SITE.clientLoginHref} className="btn-secondary mt-3">
                Client Login
              </a>
              <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
                {PRIMARY_CTA.label}
                <ArrowRight className="h-4 w-4" />
              </SiteLink>
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
