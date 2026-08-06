"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PublicBlogArticle } from "@/lib/blog/content/public";

export function FeaturedHero({ articles }: { articles: PublicBlogArticle[] }) {
  const slides = articles.length ? articles : [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => {
      if (!slides.length) return;
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = window.setInterval(() => go(index + 1), 7000);
    return () => window.clearInterval(timer);
  }, [go, index, paused, slides.length]);

  if (!slides.length) {
    return (
      <section className="border-b border-[var(--fitdog-border)] bg-[var(--fitdog-surface)] px-4 py-16 text-center">
        <p className="text-[var(--fitdog-muted)]">Featured articles will appear here after publishing.</p>
      </section>
    );
  }

  const article = slides[index];

  return (
    <section
      className="border-b border-[var(--fitdog-border)] bg-white"
      aria-roledescription="carousel"
      aria-label="Featured articles"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mx-auto grid max-w-6xl lg:grid-cols-2">
        <div className="flex flex-col justify-center px-4 py-10 md:px-10 md:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--fitdog-orange)]">Featured Article</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-[var(--fitdog-dark)] md:text-4xl">{article.title}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--fitdog-muted)] md:text-lg">{article.excerpt}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href={`/blog/${article.slug}`}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--fitdog-orange)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--fitdog-orange-hover)]"
            >
              Read the Full Article <span aria-hidden>→</span>
            </Link>
            <div className="flex items-center gap-2" role="tablist" aria-label="Featured slides">
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.slug}
                  type="button"
                  role="tab"
                  aria-selected={slideIndex === index}
                  aria-label={`Show featured article ${slideIndex + 1}: ${slide.title}`}
                  className={`h-2.5 w-2.5 rounded-full ${slideIndex === index ? "bg-[var(--fitdog-orange)]" : "bg-stone-300"}`}
                  onClick={() => setIndex(slideIndex)}
                />
              ))}
            </div>
          </div>
          {slides.length > 1 ? (
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => go(index - 1)} aria-label="Previous featured article">
                Prev
              </button>
              <button type="button" className="rounded border px-3 py-1 text-xs font-semibold" onClick={() => go(index + 1)} aria-label="Next featured article">
                Next
              </button>
            </div>
          ) : null}
        </div>
        <div className="relative min-h-[280px] lg:min-h-[420px]">
          <Image src={article.coverImage} alt={article.coverAlt} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" priority />
        </div>
      </div>
    </section>
  );
}
