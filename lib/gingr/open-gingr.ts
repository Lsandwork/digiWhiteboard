import { GINGR_EMPLOYEE_URL } from "@/lib/gingr/constants";

/** Open the Gingr employee app in a new secure browser tab. */
export function openGingrSecurely(): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(GINGR_EMPLOYEE_URL, "_blank", "noopener,noreferrer");
}
