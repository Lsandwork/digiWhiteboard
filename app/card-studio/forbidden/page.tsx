import { AccessDenied } from "@/components/card-studio/AccessDenied";

export default function CardStudioForbiddenPage() {
  return (
    <main className="admin-theme cs-app">
      <AccessDenied />
    </main>
  );
}
