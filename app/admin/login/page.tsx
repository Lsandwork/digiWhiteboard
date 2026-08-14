import { AdminLogin } from "@/components/admin/AdminLogin";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <AdminLogin nextPath={params.next ?? null} />;
}
