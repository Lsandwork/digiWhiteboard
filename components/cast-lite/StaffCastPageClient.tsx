"use client";

import { useSearchParams } from "next/navigation";
import { StaffCastLiteBoard } from "@/components/cast-lite/StaffCastLiteBoard";
import { defaultCastLiteOptions, parseCastLiteOptions } from "@/lib/whiteboard/cast-options";

export function StaffCastPageClient() {
  const searchParams = useSearchParams();
  const parsed = parseCastLiteOptions(searchParams);
  const options = {
    ...defaultCastLiteOptions("staff"),
    ...parsed,
    // Cast receivers are low-power; always prefer the lightweight motion profile.
    lowMotion: parsed.lowMotion !== false
  };

  return <StaffCastLiteBoard options={options} />;
}
