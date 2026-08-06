"use client";

import { useEffect, useState } from "react";
import { publicBlogHref } from "@/lib/blog/public-path";

const BOOKMARK_KEY = "fitdog_blog_bookmarks_v1";

export function ArticleToolbar({ slug, title }: { slug: string; title: string }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(() => publicBlogHref(slug));

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUrl(window.location.href);
    }
  }, [slug]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BOOKMARK_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      setBookmarked(list.includes(slug));
    } catch {
      setBookmarked(false);
    }
  }, [slug]);

  function toggleBookmark() {
    try {
      const raw = window.localStorage.getItem(BOOKMARK_KEY);
      const list = raw ? (JSON.parse(raw) as string[]) : [];
      const next = list.includes(slug) ? list.filter((item) => item !== slug) : [...list, slug];
      window.localStorage.setItem(BOOKMARK_KEY, JSON.stringify(next));
      setBookmarked(next.includes(slug));
      void fetch("/api/blog/public/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bookmark", slug })
      }).catch(() => undefined);
    } catch {
      // ignore
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      void fetch("/api/blog/public/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "copy_link", slug })
      }).catch(() => undefined);
    } catch {
      setCopied(false);
    }
  }

  function printArticle() {
    window.print();
  }

  const shareText = encodeURIComponent(title);
  const shareUrl = encodeURIComponent(url);

  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-[var(--fitdog-border)] py-3 print:hidden">
      <button type="button" onClick={toggleBookmark} className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-[var(--fitdog-orange)]">
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </button>
      <button type="button" onClick={() => void copyLink()} className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-[var(--fitdog-orange)]">
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button type="button" onClick={printArticle} className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-[var(--fitdog-orange)]">
        Print
      </button>
      <a
        className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-[var(--fitdog-orange)]"
        href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Share on Facebook
      </a>
      <a
        className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-[var(--fitdog-orange)]"
        href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Share on X
      </a>
    </div>
  );
}
