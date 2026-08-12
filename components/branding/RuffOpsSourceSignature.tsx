/**
 * Server-rendered inert RuffOps signature for View Page Source.
 * Must not execute. Appears in the initial HTML response only as plain text.
 */
import {
  RUFFOPS_SOURCE_SIGNATURE,
  RUFFOPS_SOURCE_SIGNATURE_ELEMENT_ID
} from "@/lib/branding/ruffops-signature";

export function RuffOpsSourceSignature() {
  return (
    <script
      id={RUFFOPS_SOURCE_SIGNATURE_ELEMENT_ID}
      type="text/plain"
      // Intentionally inert — type="text/plain" prevents execution (CSP-safe).
      dangerouslySetInnerHTML={{ __html: `\n${RUFFOPS_SOURCE_SIGNATURE}\n` }}
    />
  );
}
