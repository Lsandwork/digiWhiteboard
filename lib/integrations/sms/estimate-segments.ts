export type SmsEncoding = "GSM-7" | "UCS-2";

export type SmsSegmentEstimate = {
  encoding: SmsEncoding;
  segments: number;
  units: number;
  nonGsmCharacters: string[];
  extensionCharacterCount: number;
};

/** GSM 03.38 basic alphabet (default table). ESC (0x1B) is excluded — extension chars use it internally. */
const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);

/** GSM 03.38 extension table — each character consumes two septets (escape + char). */
const GSM7_EXTENSION = new Set(["^", "{", "}", "\\", "[", "]", "~", "|", "€"]);

function isGsm7Basic(char: string): boolean {
  return GSM7_BASIC.has(char);
}

function isGsm7Extension(char: string): boolean {
  return GSM7_EXTENSION.has(char);
}

function countGsm7Septets(body: string): { septets: number; extensionCharacterCount: number; nonGsmCharacters: string[] } {
  let septets = 0;
  let extensionCharacterCount = 0;
  const nonGsmCharacters: string[] = [];

  for (const char of body) {
    if (isGsm7Basic(char)) {
      septets += 1;
      continue;
    }
    if (isGsm7Extension(char)) {
      septets += 2;
      extensionCharacterCount += 1;
      continue;
    }
    nonGsmCharacters.push(char);
  }

  return { septets, extensionCharacterCount, nonGsmCharacters };
}

/** UTF-16 code units; supplementary characters (emoji) count as two units via surrogate pairs. */
function countUcs2Units(body: string): number {
  let units = 0;
  for (let i = 0; i < body.length; i += 1) {
    const code = body.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < body.length) {
      const next = body.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        units += 2;
        i += 1;
        continue;
      }
    }
    units += 1;
  }
  return units;
}

function segmentsForGsm7(septets: number): number {
  if (septets <= 160) return 1;
  return Math.ceil(septets / 153);
}

function segmentsForUcs2(units: number): number {
  if (units <= 70) return 1;
  return Math.ceil(units / 67);
}

/** Estimate Twilio SMS segments using GSM-7 / UCS-2 rules. */
export function estimateSmsSegments(body: string): SmsSegmentEstimate {
  const gsm = countGsm7Septets(body);
  if (gsm.nonGsmCharacters.length === 0) {
    return {
      encoding: "GSM-7",
      segments: segmentsForGsm7(gsm.septets),
      units: gsm.septets,
      nonGsmCharacters: [],
      extensionCharacterCount: gsm.extensionCharacterCount
    };
  }

  const units = countUcs2Units(body);
  return {
    encoding: "UCS-2",
    segments: segmentsForUcs2(units),
    units,
    nonGsmCharacters: [...new Set(gsm.nonGsmCharacters)],
    extensionCharacterCount: 0
  };
}

/** Replace Unicode punctuation that forces UCS-2 in automated SMS bodies. Does not strip tilde. */
export function sanitizeSmsBody(body: string): string {
  return body
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u00b7/g, "|")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u2026/g, "...");
}
