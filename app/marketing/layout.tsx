import "@/components/marketing/marketing.css";
import "@/components/marketing/brand-tokens.css";
import { ToastProvider } from "@/components/admin/ui/ToastProvider";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <MarketingShell>{children}</MarketingShell>
    </ToastProvider>
  );
}
