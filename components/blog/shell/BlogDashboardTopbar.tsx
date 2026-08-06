"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, HelpCircle, Menu, Search, X } from "lucide-react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";

type SearchResults = {
  articles: Array<{ id: string; title: string; slug?: string; status?: string }>;
  topics: Array<{ id: string; title: string; status?: string }>;
  categories: Array<{ id: string; slug: string; label: string }>;
  tags: Array<{ id: string; slug: string; label: string }>;
  authors: Array<{ id: string; slug: string; name: string }>;
};

type Props = {
  firstName: string;
  displayName: string;
  roleLabel: string;
  avatarUrl?: string | null;
  onToggleMobile: () => void;
  onLogout: () => void;
  notificationCount?: number;
};

type FlatResult = { key: string; label: string; href: string; meta: string };

export function BlogDashboardTopbar({
  firstName,
  displayName,
  roleLabel,
  avatarUrl,
  onToggleMobile,
  onLogout,
  notificationCount = 0
}: Props) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (parts[0]?.slice(0, 2) || "FD").toUpperCase();
  }, [displayName]);

  const flatResults: FlatResult[] = useMemo(() => {
    if (!results) return [];
    const rows: FlatResult[] = [];
    for (const article of results.articles) {
      rows.push({
        key: `a-${article.id}`,
        label: article.title,
        href: `${BLOG_APP_PATH}?page=editor&id=${article.id}`,
        meta: `Article · ${article.status || "unknown"}`
      });
    }
    for (const topic of results.topics) {
      rows.push({
        key: `t-${topic.id}`,
        label: topic.title,
        href: `${BLOG_APP_PATH}?page=topics`,
        meta: `Topic · ${topic.status || "idea"}`
      });
    }
    for (const category of results.categories) {
      rows.push({
        key: `c-${category.id}`,
        label: category.label,
        href: `${BLOG_APP_PATH}?page=categories`,
        meta: "Category"
      });
    }
    for (const tag of results.tags) {
      rows.push({
        key: `tag-${tag.id}`,
        label: tag.label,
        href: `${BLOG_APP_PATH}?page=tags`,
        meta: "Tag"
      });
    }
    for (const author of results.authors) {
      rows.push({
        key: `au-${author.id}`,
        label: author.name,
        href: `${BLOG_APP_PATH}?page=authors`,
        meta: "Author"
      });
    }
    return rows;
  }, [results]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isMetaK) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      const clearTimer = window.setTimeout(() => {
        setResults(null);
        setError(null);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const res = await fetch(`/api/blog/dashboard/search?q=${encodeURIComponent(trimmed)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Search failed");
          if (!cancelled) {
            setResults(json.results);
            setActiveIndex(0);
            setOpen(true);
          }
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node) && event.target !== inputRef.current) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!flatResults.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = flatResults[activeIndex];
      if (target) window.location.href = target.href;
    }
  }

  return (
    <header className="blog-dash__topbar">
      <div className="blog-dash__topbar-left">
        <button type="button" className="blog-dash__icon-btn lg:hidden" onClick={onToggleMobile} aria-label="Open sidebar">
          <Menu className="h-4 w-4" />
        </button>
        <div>
          <h1 className="blog-dash__title">Blog Dashboard</h1>
          <p className="blog-dash__welcome">Welcome back, {firstName}!</p>
        </div>
      </div>

      <div className="blog-dash__search" ref={panelRef}>
        <Search className="blog-dash__search-icon" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Search articles, topics, categories
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search articles, topics, categories..."
          autoComplete="off"
        />
        <span className="blog-dash__kbd" aria-hidden>
          ⌘ K
        </span>
        {open ? (
          <div
            role="listbox"
            aria-label="Search results"
            className="absolute left-0 right-0 top-[46px] z-50 max-h-80 overflow-auto rounded-xl border border-[var(--fitdog-border)] bg-white p-2 shadow-lg"
          >
            {loading ? <p className="px-3 py-2 text-sm text-[var(--fitdog-muted)]">Searching…</p> : null}
            {error ? <p className="px-3 py-2 text-sm text-red-600">{error}</p> : null}
            {!loading && !error && query.trim().length >= 2 && flatResults.length === 0 ? (
              <p className="px-3 py-2 text-sm text-[var(--fitdog-muted)]">No results for “{query.trim()}”.</p>
            ) : null}
            {flatResults.map((row, index) => (
              <Link
                key={row.key}
                href={row.href}
                role="option"
                aria-selected={index === activeIndex}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  index === activeIndex ? "bg-[var(--fitdog-orange-soft)]" : "hover:bg-slate-50"
                }`}
                onClick={closeSearch}
              >
                <span className="font-semibold text-[var(--fitdog-heading)]">{row.label}</span>
                <span className="mt-0.5 block text-xs text-[var(--fitdog-muted)]">{row.meta}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="blog-dash__topbar-right">
        <Link
          href={`${BLOG_APP_PATH}?page=audit`}
          className="blog-dash__icon-btn"
          aria-label={notificationCount ? `${notificationCount} notifications` : "Notifications"}
        >
          <Bell className="h-4 w-4" />
          {notificationCount > 0 ? <span className="blog-dash__notif-dot">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
        </Link>
        <Link href={`${BLOG_APP_PATH}?page=setup`} className="blog-dash__icon-btn" aria-label="Help and setup">
          <HelpCircle className="h-4 w-4" />
        </Link>
        <div className="relative">
          <button
            type="button"
            className="blog-dash__user"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="blog-dash__avatar">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" />
              ) : (
                initials
              )}
            </span>
            <span className="blog-dash__user-meta text-left">
              <span className="blog-dash__user-name block">{displayName}</span>
              <span className="blog-dash__user-role block">{roleLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--fitdog-muted)]" aria-hidden />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[46px] z-50 min-w-[180px] rounded-xl border border-[var(--fitdog-border)] bg-white p-1 shadow-lg"
            >
              <Link
                href="/admin?board=staff&tab=crossover_communication"
                role="menuitem"
                className="block rounded-lg px-3 py-2 text-sm text-[var(--fitdog-body)] hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                RuffOps Admin
              </Link>
              <Link
                href={`${BLOG_APP_PATH}?page=settings`}
                role="menuitem"
                className="block rounded-lg px-3 py-2 text-sm text-[var(--fitdog-body)] hover:bg-slate-50"
                onClick={() => setMenuOpen(false)}
              >
                Blog Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <X className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
