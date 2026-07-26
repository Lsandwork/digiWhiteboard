import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validate Twilio request signatures.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(input: {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!input.authToken || !input.signature) return false;
  const sorted = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + (input.params[key] ?? ""), "");
  const data = input.url + sorted;
  const expected = createHmac("sha1", input.authToken).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
