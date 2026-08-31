import type { Metadata } from "next";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <section className="container-page py-16">
      <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-4 max-w-3xl text-slate-400">
        RuffOps Business Solutions collects the information you submit through our public website forms — name, contact
        details, business information, and the operational challenge you describe — so we can respond to consulting
        inquiries. We do not sell this information. Questions: {SITE.email} or {SITE.phoneDisplay}.
      </p>
    </section>
  );
}
