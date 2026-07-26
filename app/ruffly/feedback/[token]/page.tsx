import { RufflyPublicFeedbackForm } from "@/components/ruffly/feedback/RufflyPublicFeedbackForm";

export const dynamic = "force-dynamic";

export default async function RufflyFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RufflyPublicFeedbackForm token={token} />;
}
