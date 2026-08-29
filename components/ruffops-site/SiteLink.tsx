"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function withMarketingBase(pathname: string, href: string): string {
  const prefixed = pathname.startsWith("/ruffops-site");
  if (!prefixed) return href;
  if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  const [path, hash] = href.split("#");
  const next = path === "/" ? "/ruffops-site" : `/ruffops-site${path}`;
  return hash ? `${next}#${hash}` : next;
}

export function isMarketingNavActive(pathname: string, href: string): boolean {
  const current = pathname.replace(/^\/ruffops-site/, "") || "/";
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}

export function SiteLink({ href, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname() || "/";
  const target = typeof href === "string" ? withMarketingBase(pathname, href) : href;
  return <Link href={target} {...props} />;
}
