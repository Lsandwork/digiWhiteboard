"use client";

import { useCallback, useState } from "react";
import type { ManagementReport } from "@/lib/staff/management-reports";

export type ManagementSupportPayload = {
  reports: ManagementReport[];
  complaints?: ManagementReport[];
  requests?: ManagementReport[];
  currentUser: { email: string | null; adminUserId: string | null; role: string };
};

export function useManagementSupportFetch(initialUrl = "/api/admin/management-support") {
  const [data, setData] = useState<ManagementSupportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (url = initialUrl) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load management support.");
      setData(body as ManagementSupportPayload);
      return body as ManagementSupportPayload;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load management support.";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [initialUrl]);

  return { data, loading, error, load, setData, setError };
}
