"use client";

import { useSearchParams } from "next/navigation";
import { LobbyCastLiteBoard } from "@/components/cast-lite/LobbyCastLiteBoard";
import { defaultCastLiteOptions, parseCastLiteOptions } from "@/lib/whiteboard/cast-options";

export function LobbyCastPageClient({ embeddedDisplayToken }: { embeddedDisplayToken?: string }) {
  const searchParams = useSearchParams();
  const parsed = parseCastLiteOptions(searchParams);
  const options = {
    ...defaultCastLiteOptions("lobby"),
    ...parsed
  };

  return <LobbyCastLiteBoard options={options} embeddedDisplayToken={embeddedDisplayToken} />;
}
