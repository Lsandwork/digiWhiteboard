import { FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";
import { NewsletterForm } from "@/components/blog/public/NewsletterForm";

type Promotion = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  active: boolean;
} | null;

export function BlogSidebar({ promotion }: { promotion: Promotion }) {
  return (
    <aside className="space-y-5">
      <div className="rounded-xl bg-[var(--fitdog-orange)] p-5 text-white shadow-sm">
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl" aria-hidden>
          ✉
        </div>
        <h2 className="text-lg font-bold">Get dog tips & Fitdog updates!</h2>
        <p className="mt-1 text-sm text-white/90">Practical notes for LA dog owners — no spam, unsubscribe anytime.</p>
        <div className="mt-4">
          <NewsletterForm compact />
        </div>
      </div>

      {promotion?.active ? (
        <div className="overflow-hidden rounded-xl border border-[var(--fitdog-border)] bg-[var(--fitdog-surface)]">
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--fitdog-muted)]">New client offer</p>
            <h2 className="mt-2 text-2xl font-extrabold text-[var(--fitdog-dark)]">{promotion.title}</h2>
            {promotion.subtitle ? <p className="mt-2 text-sm text-[var(--fitdog-muted)]">{promotion.subtitle}</p> : null}
            <a
              href={promotion.ctaUrl}
              className="mt-4 inline-flex rounded-md bg-[var(--fitdog-orange)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--fitdog-orange-hover)]"
              target="_blank"
              rel="noopener noreferrer"
            >
              {promotion.ctaLabel}
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--fitdog-border)] bg-[var(--fitdog-surface)] p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--fitdog-muted)]">New to Fitdog?</p>
          <h2 className="mt-2 text-xl font-extrabold text-[var(--fitdog-dark)]">See how daycare, boarding, and adventures work.</h2>
          <p className="mt-2 text-sm text-[var(--fitdog-muted)]">
            Learn about evaluations, supervised play, and care options that match your dog — without a fake discount claim.
          </p>
          <a
            href={FITDOG_PUBLIC_URLS.services}
            className="mt-4 inline-flex rounded-md bg-[var(--fitdog-orange)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--fitdog-orange-hover)]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore Services
          </a>
        </div>
      )}

      <div className="rounded-xl border border-[var(--fitdog-border)] bg-white p-5">
        <h2 className="text-sm font-bold text-[var(--fitdog-dark)]">Follow Our Adventures</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted)]">{FITDOG_PUBLIC_URLS.socialHandle}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Instagram", href: FITDOG_PUBLIC_URLS.instagram },
            { label: "Facebook", href: FITDOG_PUBLIC_URLS.facebook },
            { label: "TikTok", href: FITDOG_PUBLIC_URLS.tiktok },
            { label: "YouTube", href: FITDOG_PUBLIC_URLS.youtube }
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--fitdog-orange)] text-xs font-bold text-white"
              aria-label={item.label}
            >
              {item.label.slice(0, 2)}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}
