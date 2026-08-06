"use client";

import Link from "next/link";

type Props = {
  title: string;
  reason: string;
  actionLabel?: string;
  actionHref?: string;
};

export function BlogUnavailablePanel({ title, reason, actionLabel, actionHref }: Props) {
  return (
    <div className="blog-dash-card mx-auto max-w-xl p-8 text-center">
      <h2 className="text-lg font-semibold text-[var(--fitdog-heading,#121417)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--fitdog-muted,#6b7280)]">{reason}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex rounded-lg bg-[var(--fitdog-orange,#ff6f26)] px-4 py-2 text-sm font-semibold text-white"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
