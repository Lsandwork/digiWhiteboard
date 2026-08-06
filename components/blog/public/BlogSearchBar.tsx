"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { publicBlogHref } from "@/lib/blog/public-path";

export function BlogSearchBar({ basePath = publicBlogHref("/articles") }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    const qs = next.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2" role="search">
      <label className="sr-only" htmlFor="blog-search">
        Search articles
      </label>
      <input
        id="blog-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search articles"
        className="w-full rounded-md border border-[var(--fitdog-border)] px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded-md bg-[var(--fitdog-orange)] px-4 py-2 text-sm font-bold text-white">
        Search
      </button>
    </form>
  );
}
