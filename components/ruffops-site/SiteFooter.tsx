import { Cloud, MonitorPlay, Megaphone, Users } from "lucide-react";
import { BrandLogo } from "@/components/ruffops-site/BrandLogo";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { FOOTER_PRODUCT_LINKS, SITE } from "@/lib/ruffops-site/config";

const featureIcons = [Cloud, MonitorPlay, Megaphone, Users] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="ro-footer">
      <div className="ro-footer-features">
        <div className="container-page grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FOOTER_PRODUCT_LINKS.map((link, index) => {
            const Icon = featureIcons[index] ?? Cloud;
            return (
              <SiteLink key={link.href} href={link.href} className="ro-footer-feature">
                <span className="ro-footer-feature-icon">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span>{link.label}</span>
              </SiteLink>
            );
          })}
        </div>
      </div>

      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <SiteLink href="/" aria-label={`${SITE.name} home`}>
            <BrandLogo variant="dark" />
          </SiteLink>
          <p className="mt-3 max-w-sm text-sm text-slate-500">{SITE.tagline}</p>
        </div>

        <div className="text-sm text-slate-500 md:text-right">
          <p className="font-semibold uppercase tracking-[0.16em] text-slate-400">Follow us</p>
          <p className="mt-2 max-w-xs md:ml-auto">
            Official social channels will appear here when published. Reach us at{" "}
            <a className="text-orange-600 hover:underline" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>{" "}
            or{" "}
            <a className="text-orange-600 hover:underline" href={SITE.phoneHref}>
              {SITE.phoneDisplay}
            </a>
            .
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="container-page flex flex-col gap-3 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. All rights reserved. {SITE.location}.
          </p>
          <p className="flex flex-wrap gap-4">
            <SiteLink className="hover:text-slate-800" href="/privacy">
              Privacy Policy
            </SiteLink>
            <SiteLink className="hover:text-slate-800" href="/terms">
              Terms of Use
            </SiteLink>
          </p>
        </div>
      </div>
    </footer>
  );
}
