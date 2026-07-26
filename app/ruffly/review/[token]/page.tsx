import { RufflyPublicReviewForm } from "@/components/ruffly/reviews/RufflyPublicReviewForm";

export const dynamic = "force-dynamic";

export default async function RufflyReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RufflyPublicReviewForm token={token} />;
}
