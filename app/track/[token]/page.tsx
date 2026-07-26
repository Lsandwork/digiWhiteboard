import type { Metadata } from "next";
import { OwnerLiveTrackClient } from "@/components/track/OwnerLiveTrackClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your Fitdog ride",
  robots: { index: false, follow: false }
};

export default async function OwnerTrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OwnerLiveTrackClient token={token} />;
}
