"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FITDOG_BLOG_LOGO, FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";
import { publicBlogHref } from "@/lib/blog/public-path";
import { WhyFitdogBookingLink } from "@/components/blog/why-fitdog/WhyFitdogBookingLink";
import { WHY_FITDOG_PATH } from "@/lib/blog/why-fitdog/content";

const NAV = [
  { label: "Blog", href: publicBlogHref(), external: false },
  { label: "Topics", href: publicBlogHref("/articles"), external: false },
  { label: "Why Fitdog", href: publicBlogHref(WHY_FITDOG_PATH), external: false, active: true },
  { label: "Resources", href: FITDOG_PUBLIC_URLS.pricing, external: true },
  { label: "About Us", href: FITDOG_PUBLIC_URLS.about, external: true },
  { label: "Contact", href: FITDOG_PUBLIC_URLS.contact, external: true }
] as const;

export function WhyFitdogHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="wf-header">
      <div className="wf-header__inner">
        <a href={FITDOG_PUBLIC_URLS.home} className="wf-header__brand" target="_blank" rel="noopener noreferrer">
          <Image src={FITDOG_BLOG_LOGO.mark} alt="Fitdog logo" width={44} height={44} priority className="h-11 w-11" />
          <span className="wf-header__brand-text">
            <span className="wf-header__wordmark">fitdog</span>
            <span className="wf-header__sub">Santa Monica, CA</span>
          </span>
        </a>

        <nav className="wf-header__nav" aria-label="Primary">
          {NAV.map((item) =>
            item.external ? (
              <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            ) : (
              <Link key={item.label} href={item.href} className={"active" in item && item.active ? "is-active" : undefined} aria-current={"active" in item && item.active ? "page" : undefined}>
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          <WhyFitdogBookingLink action="assessment" ctaLocation="header" className="hidden sm:inline-flex" label="Book a Service" />
          <button type="button" className="wf-header__menu-btn" aria-expanded={open} aria-controls="wf-mobile-nav" onClick={() => setOpen((v) => !v)}>
            Menu
          </button>
        </div>
      </div>

      <div id="wf-mobile-nav" className={`wf-header__mobile${open ? " is-open" : ""}`}>
        {NAV.map((item) =>
          item.external ? (
            <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ) : (
            <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          )
        )}
        <WhyFitdogBookingLink action="assessment" ctaLocation="header_mobile" className="wf-btn--block mt-2" label="Book a Service" />
      </div>
    </header>
  );
}
