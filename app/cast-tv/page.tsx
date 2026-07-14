import { CastTvPlayer } from "@/components/cast-tv/CastTvPlayer";

type CastTvPageProps = {
  searchParams: Promise<{ screen?: string }>;
};

export default async function CastTvPage({ searchParams }: CastTvPageProps) {
  const params = await searchParams;
  const screenId = params.screen?.trim() || "default";

  return <CastTvPlayer screenId={screenId} />;
}
