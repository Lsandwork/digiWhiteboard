import Image from "next/image";
import type { Metadata } from "next";
import { WhyFitdogBookingLink } from "@/components/blog/why-fitdog/WhyFitdogBookingLink";
import { WhyFitdogFooter } from "@/components/blog/why-fitdog/WhyFitdogFooter";
import { WhyFitdogHeader } from "@/components/blog/why-fitdog/WhyFitdogHeader";
import { WhyFitdogLeadForm } from "@/components/blog/why-fitdog/WhyFitdogLeadForm";
import { absoluteBlogUrl } from "@/lib/blog/site-url";
import { publicBlogHref } from "@/lib/blog/public-path";
import {
  FITDOG_BUSINESS,
  WHY_FITDOG_CONVENIENCE,
  WHY_FITDOG_DIFFERENT,
  WHY_FITDOG_FAQS,
  WHY_FITDOG_HERO,
  WHY_FITDOG_SEO,
  WHY_FITDOG_SERVICES,
  WHY_FITDOG_TAXI,
  WHY_FITDOG_TESTIMONIALS,
  WHY_FITDOG_TRUST_STRIP
} from "@/lib/blog/why-fitdog/content";
import "./why-fitdog.css";

export const dynamic = "force-dynamic";

const canonical = absoluteBlogUrl(publicBlogHref(WHY_FITDOG_SEO.canonicalPath));

export const metadata: Metadata = {
  title: WHY_FITDOG_SEO.title,
  description: WHY_FITDOG_SEO.description,
  alternates: { canonical },
  openGraph: {
    title: WHY_FITDOG_SEO.title,
    description: WHY_FITDOG_SEO.description,
    type: "website",
    url: canonical,
    siteName: "Fitdog Blog"
  },
  robots: { index: true, follow: true }
};

function ServiceIcon({ icon }: { icon: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (icon === "bed") {
    return (
      <svg {...common}>
        <path d="M3 18V9h8v9M11 12h8a2 2 0 0 1 2 2v4M3 18h18M5 9V6h6v3" />
      </svg>
    );
  }
  if (icon === "scissors") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <path d="M8.5 7.5 20 18M8.5 16.5 20 6" />
      </svg>
    );
  }
  if (icon === "grad") {
    return (
      <svg {...common}>
        <path d="M2 9l10-5 10 5-10 5L2 9z" />
        <path d="M6 11.5v4.5c0 1.5 2.5 3 6 3s6-1.5 6-3v-4.5" />
      </svg>
    );
  }
  if (icon === "dumbbell") {
    return (
      <svg {...common}>
        <path d="M6 8v8M18 8v8M6 10h12M6 14h12M4 9v6M20 9v6" />
      </svg>
    );
  }
  if (icon === "car") {
    return (
      <svg {...common}>
        <path d="M3 13V9h10l4 4h4v4h-2" />
        <circle cx="7.5" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 10h16v9H4z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function DiffIcon({ icon }: { icon: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (icon === "people") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M14 19c.3-2 1.8-3.5 4.5-3.5 2 0 3.5 1 3.5 3.5" />
      </svg>
    );
  }
  if (icon === "expert") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
      </svg>
    );
  }
  if (icon === "leaf") {
    return (
      <svg {...common}>
        <path d="M5 19c8-1 13-7 14-14-7 1-13 6-14 14z" />
        <path d="M5 19c3-3 7-5 11-6" />
      </svg>
    );
  }
  if (icon === "phone") {
    return (
      <svg {...common}>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 17h2" />
      </svg>
    );
  }
  if (icon === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
    </svg>
  );
}

function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "PetStore",
    name: FITDOG_BUSINESS.name,
    image: absoluteBlogUrl("/assets/fitdog/brand/fitdog-logo-circle-badge-128.png"),
    url: FITDOG_BUSINESS.website,
    telephone: FITDOG_BUSINESS.telephone,
    email: FITDOG_BUSINESS.email,
    foundingDate: String(FITDOG_BUSINESS.foundedYear),
    address: {
      "@type": "PostalAddress",
      streetAddress: FITDOG_BUSINESS.streetAddress,
      addressLocality: FITDOG_BUSINESS.addressLocality,
      addressRegion: FITDOG_BUSINESS.addressRegion,
      postalCode: FITDOG_BUSINESS.postalCode,
      addressCountry: FITDOG_BUSINESS.country
    },
    areaServed: {
      "@type": "City",
      name: "Santa Monica"
    },
    description: WHY_FITDOG_SEO.description
  };
}

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: WHY_FITDOG_FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}

export default function WhyFitdogPage() {
  return (
    <div className="fitdog-blog why-fitdog-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

      <WhyFitdogHeader />

      <section className="wf-hero" aria-labelledby="wf-h1">
        <div>
          <p className="wf-eyebrow">{WHY_FITDOG_HERO.eyebrow}</p>
          <h1 id="wf-h1">
            {WHY_FITDOG_HERO.h1Lead}
            <span className="wf-brand">{WHY_FITDOG_HERO.h1Brand}</span>
          </h1>
          <p className="wf-hero__sub">{WHY_FITDOG_HERO.subhead}</p>
          <p className="wf-hero__body">{WHY_FITDOG_HERO.body}</p>
          <ul className="wf-hero__trust">
            {WHY_FITDOG_HERO.trustPoints.map((point) => (
              <li key={point}>
                <span className="wf-check" aria-hidden>
                  ✓
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="wf-hero__actions">
            <WhyFitdogBookingLink action="assessment" ctaLocation="hero" label="Book an Assessment" />
            <a href="#services" className="wf-btn wf-btn--secondary">
              Explore Fitdog Services
            </a>
            <WhyFitdogBookingLink action="contact" ctaLocation="hero" variant="ghost" label="Talk to the Fitdog Team" />
          </div>
        </div>
        <div className="wf-hero__media">
          <Image
            src={WHY_FITDOG_HERO.heroImage.src}
            alt={WHY_FITDOG_HERO.heroImage.alt}
            width={900}
            height={675}
            priority
            sizes="(max-width: 960px) 100vw, 48vw"
          />
          <aside className="wf-hero__card">
            <p className="wf-hero__card-title">{WHY_FITDOG_HERO.heroCard.title}</p>
            <p className="wf-hero__card-body">{WHY_FITDOG_HERO.heroCard.body}</p>
          </aside>
        </div>
      </section>

      <section id="services" className="wf-section wf-section--soft" aria-labelledby="wf-services-heading">
        <div className="wf-section__inner">
          <div className="wf-section__head">
            <h2 id="wf-services-heading">Everything Your Dog Needs. All in One Place.</h2>
            <p>Explore Fitdog services for dogs and their people in Santa Monica, CA.</p>
          </div>
          <div className="wf-services">
            {WHY_FITDOG_SERVICES.map((service) => (
              <article key={service.id} className="wf-service-card">
                <div className="wf-service-card__icon">
                  <ServiceIcon icon={service.icon} />
                </div>
                <h3>{service.title}</h3>
                <div className="wf-service-card__img">
                  <Image src={service.image.src} alt={service.image.alt} width={640} height={400} sizes="(max-width: 720px) 100vw, 33vw" />
                </div>
                <p>{service.description}</p>
                <div className="wf-service-card__actions">
                  <WhyFitdogBookingLink
                    action={service.primaryAction}
                    ctaLocation="service_card"
                    className="wf-btn--block"
                    label={service.primaryLabel}
                  />
                  <WhyFitdogBookingLink
                    action={service.secondaryAction}
                    ctaLocation="service_card_secondary"
                    variant="secondary"
                    className="wf-btn--block"
                    label={service.secondaryLabel}
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="wf-taxi">
            <div>
              <h3>
                {WHY_FITDOG_TAXI.title}
                <span className="wf-sr-only"> — {WHY_FITDOG_TAXI.seoTitle}</span>
              </h3>
              <p>
                <strong>{WHY_FITDOG_TAXI.seoTitle}.</strong> {WHY_FITDOG_TAXI.description}
              </p>
            </div>
            <div className="wf-taxi__actions">
              <WhyFitdogBookingLink action={WHY_FITDOG_TAXI.primaryAction} ctaLocation="taxi_banner" label={WHY_FITDOG_TAXI.primaryLabel} />
              <WhyFitdogBookingLink
                action={WHY_FITDOG_TAXI.secondaryAction}
                ctaLocation="taxi_banner"
                variant="secondary"
                label={WHY_FITDOG_TAXI.secondaryLabel}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="wf-section" aria-labelledby="wf-diff-heading">
        <div className="wf-section__inner">
          <div className="wf-section__head">
            <h2 id="wf-diff-heading">Why Fitdog Is Different</h2>
            <p>Learn how Fitdog approaches dog care for families in Santa Monica.</p>
          </div>
          <div className="wf-diff">
            {WHY_FITDOG_DIFFERENT.map((item) => (
              <div key={item.title} className="wf-diff__item">
                <div className="wf-diff__icon">
                  <DiffIcon icon={item.icon} />
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="get-started" className="wf-section wf-section--soft" aria-labelledby="wf-lead-heading">
        <div className="wf-section__inner wf-lead">
          <div>
            <h2 id="wf-lead-heading" style={{ margin: 0, fontSize: "clamp(1.65rem, 3vw, 2.15rem)", fontWeight: 800 }}>
              Not Sure Where to Start?
            </h2>
            <p style={{ marginTop: "0.75rem", color: "var(--fitdog-muted)", lineHeight: 1.55 }}>
              Tell us about your dog and our Santa Monica team will help identify the most appropriate starting service —
              daycare, boarding, grooming, training, taxi, sports classes, or sports & enrichment outings.
            </p>
          </div>
          <WhyFitdogLeadForm />
        </div>
      </section>

      <section className="wf-section" aria-labelledby="wf-social-heading">
        <div className="wf-section__inner wf-social">
          <div className="wf-social__photo">
            <Image
              src="/assets/fitdog/social-moments/posters/social-moment-04.jpg"
              alt="Fitdog team care moment with a dog in Santa Monica"
              width={720}
              height={900}
              sizes="(max-width: 900px) 100vw, 40vw"
            />
          </div>
          <div>
            <h2 id="wf-social-heading" style={{ margin: 0, fontSize: "clamp(1.65rem, 3vw, 2.15rem)", fontWeight: 800 }}>
              Loved by Dogs. Trusted by Their People.
            </h2>
            <p style={{ marginTop: "0.65rem", color: "var(--fitdog-muted)" }}>
              Public comments shared on Fitdog’s website — not invented for this page.
            </p>
            <div className="wf-quotes" style={{ marginTop: "1.25rem" }}>
              {WHY_FITDOG_TESTIMONIALS.map((item) => (
                <blockquote key={item.attribution} className="wf-quote">
                  <div className="wf-quote__stars" aria-hidden>
                    ★★★★★
                  </div>
                  <p>“{item.quote}”</p>
                  <footer className="wf-quote__meta">
                    {item.attribution} · {item.context}
                  </footer>
                </blockquote>
              ))}
            </div>
            <a
              href="https://www.fitdog.com/club-home/"
              className="wf-btn wf-btn--ghost"
              style={{ marginTop: "1rem" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read more on Fitdog.com →
            </a>
          </div>
        </div>
      </section>

      <section className="wf-trust-bar" aria-label="Fitdog trust highlights">
        <div className="wf-trust-bar__inner">
          {WHY_FITDOG_TRUST_STRIP.map((item) => (
            <div key={item.label} className="wf-trust-bar__item">
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wf-section wf-section--peach" aria-labelledby="wf-close-heading">
        <div className="wf-section__inner wf-close">
          <div>
            <h2 id="wf-close-heading">Your Dog Deserves a Great Day.</h2>
            <p>Explore Fitdog services in Santa Monica or talk with our team about your dog’s needs.</p>
            <div className="wf-close__actions">
              <WhyFitdogBookingLink action="assessment" ctaLocation="closing" label="Book an Assessment" />
              <WhyFitdogBookingLink action="contact" ctaLocation="closing" variant="secondary" label="Contact Fitdog" />
              <WhyFitdogBookingLink
                action="trainingConsult"
                ctaLocation="closing"
                variant="ghost"
                label="Book Training Consult"
              />
              <WhyFitdogBookingLink
                action="sportsEnrichmentConsult"
                ctaLocation="closing"
                variant="ghost"
                label="Outing Consultation"
              />
            </div>
            <div className="wf-convenience">
              {WHY_FITDOG_CONVENIENCE.map((item) => (
                <div key={item.label} className="wf-convenience__item">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="wf-close__img">
            <Image
              src="/assets/fitdog/social-moments/posters/social-moment-09.jpg"
              alt="Happy Fitdog dog ready for care in Santa Monica, CA"
              width={700}
              height={700}
              sizes="(max-width: 900px) 100vw, 40vw"
            />
          </div>
        </div>
      </section>

      <section className="wf-section" aria-labelledby="wf-faq-heading">
        <div className="wf-section__inner">
          <div className="wf-section__head">
            <h2 id="wf-faq-heading">Questions about Fitdog in Santa Monica</h2>
            <p>Clear answers before you book daycare, boarding, training, grooming, outings, or taxi.</p>
          </div>
          <div className="wf-faq">
            {WHY_FITDOG_FAQS.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <WhyFitdogFooter />
    </div>
  );
}
