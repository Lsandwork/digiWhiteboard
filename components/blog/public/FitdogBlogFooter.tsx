import { FITDOG_BLOG_BENEFITS, FITDOG_FOOTER_SERVICES } from "@/lib/blog/brand";

function BenefitIcon({ icon }: { icon: string }) {
  const common = "h-8 w-8 text-[var(--fitdog-orange)]";
  if (icon === "heart") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 6.1 5.5 5.5 0 0 1 21.5 12C19 16.4 12 21 12 21z" />
      </svg>
    );
  }
  if (icon === "paw") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="6" cy="8" r="2.2" />
        <circle cx="12" cy="5.5" r="2.2" />
        <circle cx="18" cy="8" r="2.2" />
        <path d="M8 14c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5c0 2.8-2 5-4 6.5-2-1.5-4-3.7-4-6.5z" />
      </svg>
    );
  }
  if (icon === "van") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M3 13V8h10l4 5h4v5h-2" />
        <circle cx="7.5" cy="18" r="1.8" />
        <circle cx="17" cy="18" r="1.8" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
    </svg>
  );
}

export function FitdogBlogFooter() {
  return (
    <footer>
      <section className="border-t border-[var(--fitdog-border)] bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
          {FITDOG_BLOG_BENEFITS.map((benefit) => (
            <a key={benefit.title} href={benefit.href} target="_blank" rel="noopener noreferrer" className="group flex gap-3">
              <BenefitIcon icon={benefit.icon} />
              <div>
                <h3 className="text-sm font-bold text-[var(--fitdog-dark)] group-hover:text-[var(--fitdog-orange)]">{benefit.title}</h3>
                <p className="mt-1 text-sm text-[var(--fitdog-muted)]">{benefit.description}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <div className="bg-[var(--fitdog-orange)] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-6">
          <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold" aria-label="Services">
            {FITDOG_FOOTER_SERVICES.map((service, index) => (
              <span key={service.label} className="inline-flex items-center gap-4">
                <a href={service.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {service.label}
                </a>
                {index < FITDOG_FOOTER_SERVICES.length - 1 ? <span aria-hidden className="opacity-70">|</span> : null}
              </span>
            ))}
          </nav>
          <p className="font-serif text-lg italic">Happy Dogs. Happy Lives. ♥</p>
        </div>
      </div>
    </footer>
  );
}
