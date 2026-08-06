"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FITDOG_BLOG_LOGO, FITDOG_BLOG_NAV, FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";
import { publicBlogHref } from "@/lib/blog/public-path";

export function FitdogBlogHeader({ active = "Blog" }: { active?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--fitdog-border)] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <a href={FITDOG_PUBLIC_URLS.home} className="flex items-center gap-2.5" target="_blank" rel="noopener noreferrer" aria-label="Fitdog home">
          <Image src={FITDOG_BLOG_LOGO.mark} alt="Fitdog logo" width={44} height={44} priority className="h-11 w-11" />
          <span className="text-[1.55rem] font-extrabold lowercase tracking-tight text-[var(--fitdog-dark)]">fitdog</span>
        </a>

        <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
          {FITDOG_BLOG_NAV.map((item) => {
            const isActive = item.label === active;
            const className = `text-sm font-semibold ${
              isActive
                ? "text-[var(--fitdog-orange)] underline decoration-2 underline-offset-8"
                : "text-[var(--fitdog-dark)] hover:text-[var(--fitdog-orange)]"
            }`;
            if (item.external) {
              return (
                <a key={item.label} href={item.href} className={className} target="_blank" rel="noopener noreferrer">
                  {item.label}
                </a>
              );
            }
            return (
              <Link key={item.label} href={item.href} className={className} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={FITDOG_PUBLIC_URLS.book}
            className="hidden rounded-md bg-[var(--fitdog-orange)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--fitdog-orange-hover)] sm:inline-flex"
            target="_blank"
            rel="noopener noreferrer"
          >
            Book a Service
          </a>
          <button
            type="button"
            className="inline-flex rounded-md border border-[var(--fitdog-border)] px-3 py-2 text-sm font-semibold lg:hidden"
            aria-expanded={open}
            aria-controls="fitdog-mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            Menu
          </button>
        </div>
      </div>

      {open ? (
        <div id="fitdog-mobile-nav" className="border-t border-[var(--fitdog-border)] bg-white px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-2" aria-label="Mobile">
            {FITDOG_BLOG_NAV.map((item) =>
              item.external ? (
                <a key={item.label} href={item.href} className="rounded px-2 py-2 text-sm font-semibold" target="_blank" rel="noopener noreferrer">
                  {item.label}
                </a>
              ) : (
                <Link key={item.label} href={item.href} className="rounded px-2 py-2 text-sm font-semibold" onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              )
            )}
            <a
              href={FITDOG_PUBLIC_URLS.book}
              className="mt-2 rounded-md bg-[var(--fitdog-orange)] px-4 py-2.5 text-center text-sm font-bold text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a Service
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
