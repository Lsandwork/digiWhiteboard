import { getServiceSupabase } from "@/lib/supabase/server";
import { decryptBlogSecret, encryptBlogSecret, hasEncryptedSecret } from "@/lib/blog/crypto";
import {
  generateSocialPackDeterministic,
  packItemToDownloadRow,
  toCsv
} from "@/lib/blog/social/generate";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/blog/social/types";
import { writeBlogAudit } from "@/lib/blog/service";

export async function listSocialConnections() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_social_connections")
    .select("id, platform, username, status, last_tested_at, last_error, metadata, updated_at, secret_encrypted")
    .order("platform");
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    platform: row.platform as SocialPlatform,
    username: row.username || "",
    status: row.status,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    metadata: row.metadata || {},
    hasSecret: hasEncryptedSecret(row.secret_encrypted as Record<string, unknown>),
    updatedAt: row.updated_at
  }));
}

export async function upsertSocialConnection(input: {
  platform: SocialPlatform;
  username?: string;
  secret?: string | null;
  actor?: string;
}) {
  if (!SOCIAL_PLATFORMS.includes(input.platform)) throw new Error("Unknown platform.");
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("blog_social_connections")
    .select("*")
    .eq("platform", input.platform)
    .maybeSingle();

  const secret_encrypted =
    input.secret && input.secret.trim()
      ? encryptBlogSecret(input.secret.trim())
      : (existing?.secret_encrypted as Record<string, unknown>) || {};

  const username = input.username != null ? String(input.username).trim() : String(existing?.username || "");
  const configured = Boolean(username && hasEncryptedSecret(secret_encrypted));
  const row = {
    platform: input.platform,
    username,
    secret_encrypted,
    status: configured ? "configured" : "disconnected",
    last_error: null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("blog_social_connections")
    .upsert(row, { onConflict: "platform" })
    .select("*")
    .single();
  if (error) throw error;
  await writeBlogAudit(input.actor, "social.connection_saved", "social_connection", input.platform, {
    username,
    configured
  });
  return data;
}

/**
 * Test connection — Meta/TikTok/Snap need API tokens, not password scraping.
 * We validate credentials are present and mark connected when a non-empty token exists.
 */
export async function testSocialConnection(platform: SocialPlatform, actor?: string) {
  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("blog_social_connections")
    .select("*")
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Connection not found.");

  const secret = decryptBlogSecret(row.secret_encrypted as Record<string, unknown>);
  const username = String(row.username || "").trim();
  if (!username || !secret) {
    const message =
      "Add username/page ID and access token (or app password). Platforms require API tokens — not browser password login.";
    await supabase
      .from("blog_social_connections")
      .update({ status: "error", last_error: message, last_tested_at: new Date().toISOString() })
      .eq("platform", platform);
    return { ok: false, status: "error", message };
  }

  // Lightweight readiness check (no third-party scrape). Adapters post when platform APIs are wired.
  const message = `${platform} credentials saved. Auto-post will use the official API when available; until then download generated content.`;
  await supabase
    .from("blog_social_connections")
    .update({
      status: "connected",
      last_error: null,
      last_tested_at: new Date().toISOString(),
      metadata: {
        ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
        note: "Token present — queue-ready"
      }
    })
    .eq("platform", platform);
  await writeBlogAudit(actor, "social.connection_tested", "social_connection", platform, { ok: true });
  return { ok: true, status: "connected", message };
}

export async function createSocialPack(input: {
  topic?: string | null;
  angle?: string | null;
  blogUrl?: string | null;
  articleId?: string | null;
  articleTitle?: string | null;
  createdBy?: string | null;
  queueAutoPost?: boolean;
}) {
  const supabase = getServiceSupabase();
  const pack = generateSocialPackDeterministic({
    topic: input.topic,
    angle: input.angle,
    blogUrl: input.blogUrl,
    articleTitle: input.articleTitle
  });

  const { data: packRow, error: packError } = await supabase
    .from("blog_social_packs")
    .insert({
      title: pack.title,
      prompt: input.topic || input.articleTitle || "",
      article_id: input.articleId || null,
      status: "ready",
      voice_notes: pack.voiceNotes,
      created_by: input.createdBy || null
    })
    .select("*")
    .single();
  if (packError) throw packError;

  const itemRows = pack.items.map((item, index) => ({
    pack_id: packRow.id,
    platform: item.platform,
    format: item.format,
    hook: item.hook,
    body: item.body,
    cta: item.cta,
    hashtags: item.hashtags,
    visual_direction: item.visualDirection,
    tone_tags: item.toneTags,
    script_spoken: item.scriptSpoken || "",
    on_screen_text: item.onScreenText || "",
    content: packItemToDownloadRow(item),
    sort_order: index
  }));

  const { data: items, error: itemsError } = await supabase
    .from("blog_social_pack_items")
    .insert(itemRows)
    .select("*");
  if (itemsError) throw itemsError;

  if (input.queueAutoPost) {
    const { data: connections } = await supabase
      .from("blog_social_connections")
      .select("platform, status")
      .eq("status", "connected");
    const connected = new Set((connections || []).map((c) => c.platform));
    const posts = (items || [])
      .filter((item) => connected.has(item.platform))
      .map((item) => ({
        pack_item_id: item.id,
        pack_id: packRow.id,
        platform: item.platform,
        format: item.format,
        status: "queued",
        created_by: input.createdBy || null
      }));
    if (posts.length) {
      await supabase.from("blog_social_posts").insert(posts);
    }
  }

  await writeBlogAudit(input.createdBy, "social.pack_created", "social_pack", String(packRow.id), {
    items: items?.length || 0
  });

  return { pack: packRow, items: items || [], generated: pack };
}

export async function listSocialPacks(limit = 20) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("blog_social_packs")
    .select("id, title, prompt, status, voice_notes, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getSocialPack(packId: string) {
  const supabase = getServiceSupabase();
  const { data: pack, error } = await supabase.from("blog_social_packs").select("*").eq("id", packId).single();
  if (error || !pack) throw error || new Error("Pack not found");
  const { data: items } = await supabase
    .from("blog_social_pack_items")
    .select("*")
    .eq("pack_id", packId)
    .order("sort_order", { ascending: true });
  return { pack, items: items || [] };
}

export async function downloadSocialPackCsv(packId: string, platform?: SocialPlatform, format?: string) {
  const { items } = await getSocialPack(packId);
  const filtered = items.filter((item) => {
    if (platform && item.platform !== platform) return false;
    if (format && item.format !== format) return false;
    return true;
  });
  const rows = filtered.map((item) =>
    packItemToDownloadRow({
      platform: item.platform,
      format: item.format,
      hook: item.hook,
      body: item.body,
      cta: item.cta,
      hashtags: Array.isArray(item.hashtags) ? item.hashtags.map(String) : [],
      visualDirection: item.visual_direction,
      toneTags: Array.isArray(item.tone_tags) ? item.tone_tags.map(String) : [],
      scriptSpoken: item.script_spoken,
      onScreenText: item.on_screen_text
    })
  );
  return toCsv(rows);
}

/** Process queued social posts — stub adapter until OAuth APIs are fully wired. */
export async function processSocialPostQueue(limit = 5) {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("blog_social_posts")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const post of due || []) {
    const { data: conn } = await supabase
      .from("blog_social_connections")
      .select("*")
      .eq("platform", post.platform)
      .maybeSingle();
    if (!conn || conn.status !== "connected") {
      await supabase
        .from("blog_social_posts")
        .update({
          status: "failed",
          error: "Platform not connected",
          updated_at: nowIso
        })
        .eq("id", post.id);
      results.push({ id: post.id, status: "failed", error: "not connected" });
      continue;
    }
    // Official API posting is environment-specific; mark ready-failed with guidance rather than fake success.
    await supabase
      .from("blog_social_posts")
      .update({
        status: "failed",
        error:
          "Auto-post adapter awaiting platform API credentials verification. Content remains available for download in Social Media Generator.",
        updated_at: nowIso,
        response_summary: { deferred: true, platform: post.platform }
      })
      .eq("id", post.id);
    results.push({ id: post.id, status: "deferred" });
  }
  return results;
}
