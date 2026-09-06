"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/ruffops-site/BrandLogo";
import { SiteLink, isMarketingNavActive } from "@/components/ruffops-site/SiteLink";
import { NAV, PRIMARY_CTA, SECONDARY_CTA, SITE } from "@/lib/ruffops-site/config";

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => isMarketingNavActive(pathname || "/", href);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-white/10 bg-[#0b0d12]/92 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="container-page flex h-[4.5rem] items-center justify-between gap-4">
        <SiteLink href="/" className="relative z-10" aria-label={`${SITE.name} home`}>
          <BrandLogo />
        </SiteLink>

        <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <SiteLink
              key={item.href}
              href={item.href}
              className={`relative rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(item.href) ? "text-white" : "text-slate-300 hover:text-white"
              }`}
            >
              {item.label}
              {isActive(item.href) ? (
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-orange-500" aria-hidden />
              ) : null}
            </SiteLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          <a href={SECONDARY_CTA.href} className="btn-outline text-sm">
            {SECONDARY_CTA.label}
          </a>
          <SiteLink href={PRIMARY_CTA.href} className="btn-primary text-sm">
            {PRIMARY_CTA.label}
            <ArrowRight className="h-4 w-4" />
          </SiteLink>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-nav" className="border-t border-white/10 bg-[#0b0d12] lg:hidden">
          <nav aria-label="Mobile" className="container-page flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <SiteLink
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-3 text-base font-medium ${
                  isActive(item.href) ? "bg-white/10 text-white" : "text-slate-300"
                }`}
              >
                {item.label}
              </SiteLink>
            ))}
            <a href={SECONDARY_CTA.href} className="btn-outline mt-3">
              {SECONDARY_CTA.label}
            </a>
            <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
              {PRIMARY_CTA.label}
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
