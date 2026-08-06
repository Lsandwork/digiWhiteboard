"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BLOG_HELP_GUIDE_PATH } from "@/lib/blog/help-guide";

export function BlogHelpRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(BLOG_HELP_GUIDE_PATH);
  }, [router]);
  return <p className="text-sm text-slate-600">Opening How to Use the Fitdog Blog Generator…</p>;
}
