"use client";

import { useEffect } from "react";
import { warmSocialMomentsNetworkCache } from "@/lib/lobby/social-moments-cache";

/** Registers the social-moments service worker and warms the full playlist cache. */
export function SocialMomentsCacheBootstrap() {
  useEffect(() => {
    warmSocialMomentsNetworkCache();
  }, []);

  return null;
}
