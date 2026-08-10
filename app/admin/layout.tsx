import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fitdog RuffOps",
  description: "Internal Fitdog operations command center.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  }
};

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
