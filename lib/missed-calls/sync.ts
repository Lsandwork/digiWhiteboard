import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGmailCredentials } from "@/lib/missed-calls/credentials";
import { fetchVonageCallEmails, probeGmailImap } from "@/lib/missed-calls/gmail-imap";
import { parseVonageEmail } from "@/lib/missed-calls/parse-vonage-email";
import {
  finishSyncRun,
  startSyncRun,
  upsertMissedCall
} from "@/lib/missed-calls/store";

const BUCKET = "missed-call-voicemails";

async function uploadVoicemail(
  supabase: SupabaseClient,
  params: {
    messageId: string;
    filename: string;
    contentType: string;
    content: Buffer;
  }
): Promise<{ path: string; contentType: string; filename: string; size: number } | null> {
  if (!params.content.length) return null;
  const safeName = params.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "voicemail.mp3";
  const path = `${params.messageId.replace(/[^\w.@\-]+/g, "_")}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, params.content, {
    contentType: params.contentType || "application/octet-stream",
    upsert: true
  });
  if (error) {
    console.error("voicemail upload failed", error.message);
    return null;
  }
  return {
    path,
    contentType: params.contentType || "application/octet-stream",
    filename: safeName,
    size: params.content.length
  };
}

function guessAudioMeta(url: string, contentTypeHeader: string | null): { filename: string; contentType: string } {
  const type = (contentTypeHeader || "").split(";")[0]?.trim().toLowerCase() || "";
  const fromUrl = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1]?.toLowerCase();
  if (type.startsWith("audio/")) {
    const ext = type.includes("wav") ? "wav" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : type.split("/")[1] || "audio";
    return { filename: `voicemail.${ext}`, contentType: type };
  }
  if (fromUrl === "wav") return { filename: "voicemail.wav", contentType: "audio/wav" };
  if (fromUrl === "mp3") return { filename: "voicemail.mp3", contentType: "audio/mpeg" };
  if (fromUrl === "m4a") return { filename: "voicemail.m4a", contentType: "audio/mp4" };
  return { filename: "voicemail.audio", contentType: type || "application/octet-stream" };
}

async function downloadRemoteVoicemail(
  url: string
): Promise<{ content: Buffer; contentType: string; filename: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "audio/*,application/octet-stream,*/*" }
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) return null;
    // Reject obvious HTML login walls.
    const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) return null;
    const meta = guessAudioMeta(url, contentType);
    return { content: buf, contentType: meta.contentType, filename: meta.filename };
  } catch (error) {
    console.error("remote voicemail download failed", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function syncMissedCallsFromGmail(params: {
  supabase: SupabaseClient;
  trigger: "cron" | "manual";
  actorUserId?: string | null;
}): Promise<{
  ok: boolean;
  runId: string;
  messagesScanned: number;
  callsCreated: number;
  callsUpdated: number;
  message: string;
}> {
  const creds = await loadGmailCredentials(params.supabase);
  if (!creds.pass) {
    const run = await startSyncRun(params.supabase, {
      trigger: params.trigger,
      actorUserId: params.actorUserId
    });
    await finishSyncRun(params.supabase, {
      id: run.id,
      status: "skipped",
      message:
        "Gmail IMAP is not configured. Save a Google App Password in Missed Calls (or set GMAIL_IMAP_APP_PASSWORD)."
    });
    return {
      ok: false,
      runId: run.id,
      messagesScanned: 0,
      callsCreated: 0,
      callsUpdated: 0,
      message:
        "Gmail IMAP is not configured. Save a Google App Password in Missed Calls (or set GMAIL_IMAP_APP_PASSWORD)."
    };
  }

  const run = await startSyncRun(params.supabase, {
    trigger: params.trigger,
    actorUserId: params.actorUserId
  });

  let messagesScanned = 0;
  let callsCreated = 0;
  let callsUpdated = 0;
  let errorCount = 0;
  const errors: string[] = [];

  try {
    const messages = await fetchVonageCallEmails({
      auth: { user: creds.user, pass: creds.pass }
    });
    messagesScanned = messages.length;

    for (const msg of messages) {
      try {
        const parsed = parseVonageEmail({
          from: msg.from,
          subject: msg.subject,
          text: msg.text,
          html: msg.html
        });
        if (!parsed.isVonageCallEmail) continue;

        let storagePath: string | null = null;
        let contentType: string | null = null;
        let filename: string | null = null;
        let byteSize: number | null = null;

        const audio = msg.attachments[0];
        if (audio) {
          const uploaded = await uploadVoicemail(params.supabase, {
            messageId: msg.messageId,
            filename: audio.filename,
            contentType: audio.contentType,
            content: audio.content
          });
          if (uploaded) {
            storagePath = uploaded.path;
            contentType = uploaded.contentType;
            filename = uploaded.filename;
            byteSize = uploaded.size;
          }
        } else if (parsed.voicemailUrl) {
          const remote = await downloadRemoteVoicemail(parsed.voicemailUrl);
          if (remote) {
            const uploaded = await uploadVoicemail(params.supabase, {
              messageId: msg.messageId,
              filename: remote.filename,
              contentType: remote.contentType,
              content: remote.content
            });
            if (uploaded) {
              storagePath = uploaded.path;
              contentType = uploaded.contentType;
              filename = uploaded.filename;
              byteSize = uploaded.size;
            }
          }
        }

        const result = await upsertMissedCall(params.supabase, {
          gmail_message_id: msg.messageId,
          gmail_thread_id: msg.threadId,
          source: "vonage_email",
          call_type: parsed.callType === "other" && (storagePath || parsed.voicemailUrl)
            ? "voicemail"
            : parsed.callType,
          from_number: parsed.fromNumber,
          from_name: parsed.fromName,
          to_number: parsed.toNumber,
          subject: msg.subject || "(no subject)",
          snippet: parsed.snippet,
          body_text: msg.text || "",
          body_html: msg.html || "",
          received_at: msg.date.toISOString(),
          voicemail_url: parsed.voicemailUrl,
          voicemail_storage_path: storagePath,
          voicemail_content_type: contentType,
          voicemail_filename: filename,
          voicemail_byte_size: byteSize,
          raw: {
            from: msg.from,
            uid: msg.uid,
            attachmentCount: msg.attachments.length
          }
        });
        if (result.created) callsCreated += 1;
        else callsUpdated += 1;
      } catch (inner) {
        errorCount += 1;
        errors.push(inner instanceof Error ? inner.message : String(inner));
      }
    }

    const message = `Synced ${messagesScanned} Gmail messages → ${callsCreated} new, ${callsUpdated} updated.`;
    await finishSyncRun(params.supabase, {
      id: run.id,
      status: errorCount && !callsCreated && !callsUpdated ? "failed" : "completed",
      messages_scanned: messagesScanned,
      calls_created: callsCreated,
      calls_updated: callsUpdated,
      error_count: errorCount,
      message,
      error_details: errors.slice(0, 8).join("\n") || undefined
    });

    return {
      ok: true,
      runId: run.id,
      messagesScanned,
      callsCreated,
      callsUpdated,
      message
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(params.supabase, {
      id: run.id,
      status: "failed",
      messages_scanned: messagesScanned,
      calls_created: callsCreated,
      calls_updated: callsUpdated,
      error_count: errorCount + 1,
      message,
      error_details: message
    });
    return {
      ok: false,
      runId: run.id,
      messagesScanned,
      callsCreated,
      callsUpdated,
      message
    };
  }
}

export async function testGmailConnection(supabase: SupabaseClient) {
  const creds = await loadGmailCredentials(supabase);
  if (!creds.pass) {
    return { ok: false, message: "Gmail IMAP is not configured." };
  }
  return probeGmailImap({ user: creds.user, pass: creds.pass });
}
