import { Hexagon, PawPrint } from "lucide-react";
import { SITE } from "@/lib/ruffops-site/config";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ro-line bg-ro-950">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <SiteLink href="/" className="inline-flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ro-line bg-ro-700/70">
              <Hexagon className="absolute h-9 w-9 text-ro-electric/30" strokeWidth={1.2} />
              <PawPrint className="h-4 w-4 text-ro-accent" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-bold text-white">{SITE.name}</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-ro-electric/80">
                {SITE.lockup}
              </span>
            </span>
          </SiteLink>
          <p className="mt-4 max-w-xs text-sm text-slate-400">{SITE.tagline}</p>
          <p className="mt-3 text-sm text-slate-400">{SITE.serviceArea}</p>
          <p className="mt-4 space-x-2 text-sm">
            <a className="text-ro-accent-soft hover:underline" href={SITE.phoneHref}>
              {SITE.phoneDisplay}
            </a>
            <span className="text-slate-600">·</span>
            <a className="text-ro-accent-soft hover:underline" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Company</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li><SiteLink className="hover:text-white" href="/about">About</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/ai-platform">AI Platform</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/attune">Attune™</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/scenarios">Operational Scenarios</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/contact">Contact</SiteLink></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Services</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li><SiteLink className="hover:text-white" href="/services">Operations Audit</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/services">AI Operations Setup</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/services">Staff Training Systems</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/services">Revenue Strategy</SiteLink></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Industries</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li><SiteLink className="hover:text-white" href="/industries">Dog Daycares</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/industries">Dog Boarding</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/industries">Dog Rescues</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/industries">All Industries</SiteLink></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Resources</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li><SiteLink className="hover:text-white" href="/ai-platform">Dog Facility AI Software</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/insights">Blog</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/resources">Online Programs</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/resources#checklist">Operations Risk Checklist</SiteLink></li>
            <li><SiteLink className="hover:text-white" href="/resources#faq">FAQ</SiteLink></li>
            <li>
              <a className="hover:text-white" href={SITE.clientLoginHref}>
                Client Login
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ro-line">
        <div className="container-page flex flex-col gap-3 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. All rights reserved.
          </p>
          <p className="flex gap-4">
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
