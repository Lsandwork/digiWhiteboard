import { redirect } from "next/navigation";

/** Public short path compatible with track.fitdog.com/t/[token]. */
export default async function ShortTrackPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/track/${encodeURIComponent(token)}`);
}
