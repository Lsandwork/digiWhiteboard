import type { MissedCallType } from "@/lib/missed-calls/types";

const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}|\+\d{10,15}/g;

const VOICEMAIL_LINK_RE =
  /https?:\/\/[^\s"'<>]+(?:voicemail|vm|recording|media|listen)[^\s"'<>]*/gi;

const AUDIO_LINK_RE = /https?:\/\/[^\s"'<>]+\.(?:mp3|wav|ogg|m4a|aac)(?:\?[^\s"'<>]*)?/gi;

export type ParsedVonageEmail = {
  isVonageCallEmail: boolean;
  callType: MissedCallType;
  fromNumber: string | null;
  fromName: string | null;
  toNumber: string | null;
  voicemailUrl: string | null;
  snippet: string;
};

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return value.trim() || null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value.startsWith("+") ? `+${digits}` : `+${digits}`;
}

function firstPhone(text: string): string | null {
  const match = text.match(PHONE_RE);
  return match?.[0] ? normalizePhone(match[0]) : null;
}

function extractLabeledPhone(text: string, labels: RegExp): string | null {
  const re = new RegExp(
    `${labels.source}\\s*[:\-]?\\s*(${PHONE_RE.source})`,
    "i"
  );
  const m = text.match(re);
  return m?.[1] ? normalizePhone(m[1]) : null;
}

export function isVonageRelatedEmail(params: {
  from: string;
  subject: string;
  text: string;
}): boolean {
  const hay = `${params.from}\n${params.subject}\n${params.text}`.toLowerCase();
  if (/vonage|nexmo|vonagebusiness\.com|voip\.ms/.test(hay)) return true;
  if (
    /missed\s*call|voice\s*mail|voicemail|left you a message|new message from/i.test(
      `${params.subject}\n${params.text}`
    ) &&
    /call|phone|dial|caller/i.test(hay)
  ) {
    // Conservative: only treat as vonage-family if headers/body hint telecom vendor.
    return /vonage|nexmo|voip|sip|pbx|call recording/i.test(hay);
  }
  return false;
}

export function classifyCallType(subject: string, text: string): MissedCallType {
  const hay = `${subject}\n${text}`.toLowerCase();
  if (/voice\s*mail|voicemail|left you a message|new message/.test(hay)) {
    return "voicemail";
  }
  if (/missed\s*call|no answer|not answered|caller hung/.test(hay)) {
    return "missed_call";
  }
  return "other";
}

export function parseVonageEmail(params: {
  from: string;
  subject: string;
  text: string;
  html?: string;
}): ParsedVonageEmail {
  const text = params.text || stripHtml(params.html || "");
  const combined = `${params.subject}\n${text}`;
  const isVonageCallEmail = isVonageRelatedEmail({
    from: params.from,
    subject: params.subject,
    text
  });

  const fromNumber =
    extractLabeledPhone(combined, /(?:from|caller|calling(?:\s+number)?)/i) ||
    firstPhone(`${params.subject}\n${text.slice(0, 500)}`);

  const toNumber =
    extractLabeledPhone(combined, /(?:to|called|dialed|your number)/i) || null;

  const nameMatch =
    combined.match(
      /(?:from|caller)\s*[:\-]\s*([A-Za-z][A-Za-z0-9 .,'-]{1,60})(?:\s+at|\s+\+|[\n\r])/i
    ) ||
    params.subject.match(
      /(?:voicemail|missed call|message)\s+from\s+([A-Za-z][A-Za-z0-9 .,'-]{1,60})/i
    );

  const links = [
    ...(params.html || "").match(VOICEMAIL_LINK_RE) || [],
    ...(params.html || "").match(AUDIO_LINK_RE) || [],
    ...text.match(VOICEMAIL_LINK_RE) || [],
    ...text.match(AUDIO_LINK_RE) || []
  ].map((u) => u.replace(/[)>.,;]+$/, ""));

  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 280);

  return {
    isVonageCallEmail,
    callType: classifyCallType(params.subject, text),
    fromNumber,
    fromName: nameMatch?.[1]?.trim() || null,
    toNumber,
    voicemailUrl: links[0] || null,
    snippet
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function formatPhoneDisplay(value: string | null | undefined): string {
  if (!value) return "Unknown caller";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value;
}
