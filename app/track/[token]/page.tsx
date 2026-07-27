import { OwnerLiveTrackClient } from "@/components/track/OwnerLiveTrackClient";

export const dynamic = "force-dynamic";

export default async function OwnerTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OwnerLiveTrackClient token={token} />;
}
