"use client";

import { TvErrorRecovery } from "@/components/display/TvErrorRecovery";

export default function BoardsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <TvErrorRecovery error={error} reset={reset} title="Team Lead board reconnecting" />;
}
