"use client";

import Link from "next/link";
import { Camera, Home, MoreHorizontal, PenLine, Share2 } from "lucide-react";
import { BLOG_APP_PATH, type BlogPageId } from "@/lib/blog/constants";

type Item = {
  id: string;
  label: string;
  icon: typeof Home;
  page?: BlogPageId;
  more?: boolean;
  permission?: string;
};

const ITEMS: Item[] = [
  { id: "home", label: "Home", icon: Home, page: "overview", permission: "blog.view" },
  { id: "write", label: "Write", icon: PenLine, page: "generate", permission: "blog.create" },
  { id: "social", label: "Social", icon: Share2, page: "social-generator", permission: "blog.create" },
  { id: "media", label: "Media", icon: Camera, page: "media", permission: "blog.manage_media" },
  { id: "more", label: "More", icon: MoreHorizontal, more: true }
];

const PRIMARY_PAGES = new Set<BlogPageId>(["overview", "generate", "social-generator", "media"]);

type Props = {
  page: BlogPageId;
  canAccess: (permission: string) => boolean;
  onOpenMore: () => void;
};

export function BlogMobileTabBar({ page, canAccess, onOpenMore }: Props) {
  const moreActive = !PRIMARY_PAGES.has(page);

  return (
    <nav className="blog-mobile-tabbar" aria-label="Primary">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        if (item.more) {
          return (
            <button
              key={item.id}
              type="button"
              className={`blog-mobile-tabbar__item${moreActive ? " is-active" : ""}`}
              aria-current={moreActive ? "page" : undefined}
              onClick={onOpenMore}
            >
              <Icon size={22} strokeWidth={moreActive ? 2.4 : 2} aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        }
        if (item.permission && !canAccess(item.permission)) return null;
        const href = `${BLOG_APP_PATH}?page=${item.page}`;
        const active = page === item.page;
        return (
          <Link
            key={item.id}
            href={href}
            className={`blog-mobile-tabbar__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
