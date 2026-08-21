"use client";

import { TvErrorRecovery } from "@/components/display/TvErrorRecovery";

export default function LobbyCastError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <TvErrorRecovery error={error} reset={reset} title="Lobby board reconnecting" />;
}
