import type { Metadata } from "next";
import { OwnerTrackingExperience } from "@/components/tracking/OwnerTrackingExperience";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Fitdog Live Tracking",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true
  },
  other: {
    "referrer": "no-referrer"
  }
};

export default async function TrackPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <>
      <meta name="referrer" content="no-referrer" />
      <meta httpEquiv="Cache-Control" content="no-store" />
      <OwnerTrackingExperience token={token} />
    </>
  );
}
