import Image from "next/image";
import Link from "next/link";
import { FITDOG_BLOG_LOGO, FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";
import { publicBlogHref } from "@/lib/blog/public-path";
import { FITDOG_BUSINESS, WHY_FITDOG_PATH } from "@/lib/blog/why-fitdog/content";

export function WhyFitdogFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="wf-footer">
      <div className="wf-footer__grid">
        <div className="wf-footer__brand">
          <Image src={FITDOG_BLOG_LOGO.markCircle} alt="Fitdog" width={48} height={48} />
          <p>
            Dog daycare, boarding, grooming, training, outings and transportation in Santa Monica, CA.{" "}
            {FITDOG_BUSINESS.serviceAreaNote}.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            {FITDOG_BUSINESS.streetAddress}
            <br />
            {FITDOG_BUSINESS.addressLocality}, {FITDOG_BUSINESS.addressRegion} {FITDOG_BUSINESS.postalCode}
            <br />
            <a href={`tel:${FITDOG_BUSINESS.telephone}`}>{FITDOG_BUSINESS.telephoneDisplay}</a>
            <br />
            <a href={`mailto:${FITDOG_BUSINESS.email}`}>{FITDOG_BUSINESS.email}</a>
          </p>
          <div className="wf-footer__social" aria-label="Social">
            <a href={FITDOG_PUBLIC_URLS.instagram} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href={FITDOG_PUBLIC_URLS.facebook} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
          </div>
        </div>
        <div>
          <h3>Services</h3>
          <ul>
            <li>
              <a href={FITDOG_PUBLIC_URLS.daycare} target="_blank" rel="noopener noreferrer">
                Daycare
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.boarding} target="_blank" rel="noopener noreferrer">
                Boarding
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.grooming} target="_blank" rel="noopener noreferrer">
                Grooming
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.training} target="_blank" rel="noopener noreferrer">
                Training
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.hikes} target="_blank" rel="noopener noreferrer">
                Sports Classes
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.hikes} target="_blank" rel="noopener noreferrer">
                Sports & Enrichment Outings
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.contact} target="_blank" rel="noopener noreferrer">
                Taxi Service
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h3>Why Fitdog</h3>
          <ul>
            <li>
              <Link href={publicBlogHref(WHY_FITDOG_PATH)}>Why Fitdog</Link>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.about} target="_blank" rel="noopener noreferrer">
                About Us
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.pricing} target="_blank" rel="noopener noreferrer">
                Pricing
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h3>Company</h3>
          <ul>
            <li>
              <Link href={publicBlogHref()}>Blog</Link>
            </li>
            <li>
              <Link href={publicBlogHref("/articles")}>All Articles</Link>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.contact} target="_blank" rel="noopener noreferrer">
                Contact
              </a>
            </li>
            <li>
              <a href={FITDOG_PUBLIC_URLS.members} target="_blank" rel="noopener noreferrer">
                Members Login
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="wf-footer__bottom">
        <span>
          © {year} Fitdog · Santa Monica, CA
        </span>
        <span>Lobby hours: {FITDOG_BUSINESS.lobbyHours}</span>
      </div>
    </footer>
  );
}
