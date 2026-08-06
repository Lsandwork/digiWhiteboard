import type { Metadata } from "next";
import { absoluteBlogUrl, getPublicBlogSiteOrigin } from "@/lib/blog/site-url";
import { publicBlogHref } from "@/lib/blog/public-path";
import "./blog.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicBlogSiteOrigin()),
  title: {
    default: "Fitdog Blog | Practical Dog Care Tips for LA",
    template: "%s | Fitdog Blog"
  },
  description:
    "Practical Fitdog dog-care guides for LA owners — summer safety, puppy routines, enrichment, beach days, boarding prep, and more.",
  alternates: { canonical: absoluteBlogUrl(publicBlogHref()) },
  openGraph: {
    type: "website",
    siteName: "Fitdog Blog",
    title: "Fitdog Blog",
    description: "Practical dog-care tips from Fitdog for Southern California dog owners.",
    url: absoluteBlogUrl(publicBlogHref())
  },
  robots: { index: true, follow: true }
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="fitdog-blog min-h-screen">{children}</div>;
}
