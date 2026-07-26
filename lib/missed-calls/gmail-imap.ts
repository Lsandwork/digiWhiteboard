import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail, type Attachment } from "mailparser";

export type GmailFetchMessage = {
  uid: number;
  messageId: string;
  threadId: string | null;
  from: string;
  subject: string;
  date: Date;
  text: string;
  html: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
};

export type GmailImapAuth = {
  user: string;
  pass: string;
  host?: string;
  port?: number;
  mailbox?: string;
};

export type GmailImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
};

export function getEnvGmailImapConfig(): GmailImapConfig | null {
  const user =
    process.env.GMAIL_IMAP_USER?.trim() ||
    process.env.MISSED_CALLS_GMAIL_USER?.trim() ||
    "lonnie@fitdog.com";
  const pass =
    process.env.GMAIL_IMAP_APP_PASSWORD?.trim() ||
    process.env.MISSED_CALLS_GMAIL_APP_PASSWORD?.trim() ||
    process.env.GMAIL_IMAP_PASSWORD?.trim() ||
    "";
  if (!pass) return null;
  return {
    host: process.env.GMAIL_IMAP_HOST?.trim() || "imap.gmail.com",
    port: Number(process.env.GMAIL_IMAP_PORT || 993),
    secure: true,
    user,
    pass,
    mailbox: process.env.GMAIL_IMAP_MAILBOX?.trim() || "INBOX"
  };
}

/** @deprecated Prefer resolveGmailImapConfig / auth overrides. */
export function getGmailImapConfig(): GmailImapConfig {
  const env = getEnvGmailImapConfig();
  if (!env) {
    throw new Error(
      "Gmail IMAP password is not configured. Set GMAIL_IMAP_APP_PASSWORD or save an App Password in Missed Calls."
    );
  }
  return env;
}

export function isGmailConfigured(): boolean {
  return Boolean(getEnvGmailImapConfig());
}

export function buildGmailImapConfig(auth: GmailImapAuth): GmailImapConfig {
  if (!auth.pass?.trim()) {
    throw new Error(
      "Gmail IMAP password is not configured. Set GMAIL_IMAP_APP_PASSWORD or save an App Password in Missed Calls."
    );
  }
  return {
    host: auth.host?.trim() || process.env.GMAIL_IMAP_HOST?.trim() || "imap.gmail.com",
    port: auth.port || Number(process.env.GMAIL_IMAP_PORT || 993),
    secure: true,
    user: auth.user?.trim() || "lonnie@fitdog.com",
    pass: auth.pass.trim(),
    mailbox: auth.mailbox?.trim() || process.env.GMAIL_IMAP_MAILBOX?.trim() || "INBOX"
  };
}

async function withClient<T>(
  auth: GmailImapAuth | undefined,
  fn: (client: ImapFlow, config: GmailImapConfig) => Promise<T>
): Promise<T> {
  const config = auth ? buildGmailImapConfig(auth) : getGmailImapConfig();
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    emitLogs: false
  });
  await client.connect();
  try {
    return await fn(client, config);
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}

function attachmentList(parsed: ParsedMail): GmailFetchMessage["attachments"] {
  const list: Attachment[] = parsed.attachments || [];
  return list
    .filter((att) => {
      const type = String(att.contentType || "").toLowerCase();
      const name = String(att.filename || "").toLowerCase();
      return (
        type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(name) ||
        /voicemail|recording/i.test(name)
      );
    })
    .map((att) => ({
      filename: att.filename || "voicemail.audio",
      contentType: att.contentType || "application/octet-stream",
      size: att.size || (att.content ? att.content.length : 0),
      content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content || [])
    }));
}

/**
 * Fetch recent Vonage / missed-call / voicemail emails from Gmail via IMAP.
 * Uses OR search across From/Subject; falls back to scanning recent mail.
 */
export async function fetchVonageCallEmails(params?: {
  lookbackDays?: number;
  maxMessages?: number;
  auth?: GmailImapAuth;
}): Promise<GmailFetchMessage[]> {
  const lookbackDays = params?.lookbackDays ?? Number(process.env.MISSED_CALLS_LOOKBACK_DAYS || 30);
  const maxMessages = params?.maxMessages ?? Number(process.env.MISSED_CALLS_MAX_MESSAGES || 80);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  return withClient(params?.auth, async (client, config) => {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      let uids: number[] = [];
      const searches: Array<object> = [
        { from: "vonage", since },
        { from: "nexmo", since },
        { from: "voicemail@vonagebusiness.com", since },
        { from: "vonagebusiness.com", since },
        { subject: "voicemail", since },
        { subject: "missed call", since },
        { subject: "Vonage", since },
        { subject: "new message", since }
      ];
      for (const query of searches) {
        try {
          const found = await client.search(query, { uid: true });
          if (Array.isArray(found)) uids.push(...found.map(Number));
        } catch {
          // continue
        }
      }
      uids = [...new Set(uids)].sort((a, b) => b - a).slice(0, maxMessages);

      if (!uids.length) {
        const all = await client.search({ since }, { uid: true });
        const recent = (Array.isArray(all) ? all.map(Number) : []).sort((a, b) => b - a).slice(0, 120);
        uids = recent;
      }

      const out: GmailFetchMessage[] = [];
      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true,
        source: true,
        headers: ["x-gm-thrid", "message-id"]
      })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from =
          parsed.from?.text ||
          msg.envelope?.from?.map((f) => `${f.name || ""} <${f.address || ""}>`).join(", ") ||
          "";
        const subject = parsed.subject || msg.envelope?.subject || "";
        const text = parsed.text || "";
        const html = typeof parsed.html === "string" ? parsed.html : "";
        const messageId =
          parsed.messageId ||
          msg.envelope?.messageId ||
          `uid-${msg.uid}@gmail.local`;
        const date = parsed.date || msg.envelope?.date || new Date();
        out.push({
          uid: msg.uid,
          messageId: String(messageId).replace(/^<|>$/g, ""),
          threadId: null,
          from,
          subject,
          date,
          text,
          html,
          attachments: attachmentList(parsed)
        });
      }
      return out.sort((a, b) => b.date.getTime() - a.date.getTime());
    } finally {
      lock.release();
    }
  });
}

export async function probeGmailImap(auth?: GmailImapAuth): Promise<{
  ok: boolean;
  user: string;
  mailbox: string;
  message: string;
}> {
  return withClient(auth, async (client, config) => {
    const status = await client.status(config.mailbox, { messages: true, unseen: true });
    return {
      ok: true,
      user: config.user,
      mailbox: config.mailbox,
      message: `Connected. ${status.messages ?? 0} messages, ${status.unseen ?? 0} unread.`
    };
  });
}
