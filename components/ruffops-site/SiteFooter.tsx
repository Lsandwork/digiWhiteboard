import { BrandLogo } from "@/components/ruffops-site/BrandLogo";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { FOOTER_PRODUCT_LINKS, SITE } from "@/lib/ruffops-site/config";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ro-line bg-[#07090f] text-slate-300">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.2fr_1fr_0.8fr]">
        <div>
          <SiteLink href="/" aria-label={`${SITE.name} home`}>
            <BrandLogo />
          </SiteLink>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-400">{SITE.tagline}</p>
          <p className="mt-3 text-sm text-slate-500">{SITE.serviceArea}</p>
          <p className="mt-5 space-x-2 text-sm">
            <a className="text-orange-300 hover:underline" href={SITE.phoneHref}>
              {SITE.phoneDisplay}
            </a>
            <span className="text-slate-600">·</span>
            <a className="text-orange-300 hover:underline" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Solutions</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {FOOTER_PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <SiteLink className="hover:text-white" href={link.href}>
                  {link.label}
                </SiteLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <SiteLink className="hover:text-white" href="/why-ruffops">
                Why ruffOPS
              </SiteLink>
            </li>
            <li>
              <SiteLink className="hover:text-white" href="/pricing">
                Pricing
              </SiteLink>
            </li>
            <li>
              <SiteLink className="hover:text-white" href="/about">
                About
              </SiteLink>
            </li>
            <li>
              <SiteLink className="hover:text-white" href="/support">
                Support
              </SiteLink>
            </li>
            <li>
              <SiteLink className="hover:text-white" href="/get-started">
                Get Started
              </SiteLink>
            </li>
            <li>
              <a className="hover:text-white" href={SITE.loginHref}>
                Login
              </a>
            </li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            Social profiles will appear here when official ruffOPS channels are published. Until then, reach us by email
            or phone.
          </p>
        </div>
      </div>

      <div className="border-t border-ro-line">
        <div className="container-page flex flex-col gap-3 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. All rights reserved. {SITE.location}.
          </p>
          <p className="flex flex-wrap gap-4">
            <SiteLink className="hover:text-white" href="/privacy">
              Privacy Policy
            </SiteLink>
            <SiteLink className="hover:text-white" href="/terms">
              Terms of Use
            </SiteLink>
          </p>
        </div>
      </div>
    </footer>
  );
}
