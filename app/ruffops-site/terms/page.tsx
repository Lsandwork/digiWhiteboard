import type { Metadata } from "next";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <section className="container-page py-16">
      <h1 className="text-4xl font-bold text-white">Terms of Use</h1>
      <p className="mt-4 max-w-3xl text-slate-400">
        The public RuffOps website is for informational and inquiry purposes. Consulting engagements, software access, and
        Attune™ demos are governed by a separate agreement. Illustrative metrics and scenarios are examples, not guarantees.
        Contact {SITE.email} with questions.
      </p>
    </section>
  );
}
