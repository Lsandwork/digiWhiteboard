"use client";

import { TvErrorRecovery } from "@/components/display/TvErrorRecovery";

export default function CastTvError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <TvErrorRecovery error={error} reset={reset} title="CAST-TV reconnecting" />;
}
