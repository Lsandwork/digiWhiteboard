import { textLooksAiGenerated } from "@/lib/blog/media/ai-image-guard";
import type { BlogImageCandidate } from "@/lib/blog/media/types";

type RawWebHit = {
  id: string;
  url: string;
  thumbUrl?: string;
  title: string;
  creator?: string;
  license?: string;
  licenseUrl?: string;
  sourcePageUrl?: string;
  tags?: string[];
  provider: "openverse" | "unsplash" | "pexels";
  width?: number;
  height?: number;
};

function buildQueries(topic: string): string[] {
  const base = topic.replace(/[^\w\s-]/g, " ").trim() || "dog daycare";
  return [
    `${base} dog`,
    `dog daycare play`,
    `happy dog outdoor santa monica`,
    `dog training leash walk`,
    `dogs playing together park`
  ].map((q) => q.slice(0, 120));
}

function acceptHit(hit: RawWebHit): boolean {
  if (!hit.url || !/^https?:\/\//i.test(hit.url)) return false;
  if (
    textLooksAiGenerated(
      hit.title,
      hit.creator,
      hit.license,
      ...(hit.tags || []),
      hit.sourcePageUrl
    )
  ) {
    return false;
  }
  // Prefer real photography hosts; skip obvious AI marketplaces when detectable in URL
  if (/midjourney|openai\.com\/dall|generated\.photos|thispersondoesnotexist/i.test(hit.url)) {
    return false;
  }
  return true;
}

async function searchOpenverse(query: string, limit: number): Promise<RawWebHit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(Math.min(20, limit)));
  url.searchParams.set("license", "cc0,pdm,by,by-sa,by-nc,by-nc-sa");
  url.searchParams.set("category", "photograph");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "FitdogBlog/1.0 (staff.ruffops.com)" },
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      title?: string;
      url?: string;
      thumbnail?: string;
      creator?: string;
      license?: string;
      license_url?: string;
      foreign_landing_url?: string;
      tags?: Array<{ name?: string } | string>;
      width?: number;
      height?: number;
      filetype?: string;
      category?: string;
    }>;
  };

  return (json.results || []).map((row) => {
    const tags = (row.tags || []).map((t) => (typeof t === "string" ? t : String(t.name || "")));
    return {
      id: `openverse:${row.id}`,
      url: String(row.url || ""),
      thumbUrl: row.thumbnail ? String(row.thumbnail) : undefined,
      title: String(row.title || "Dog photograph"),
      creator: row.creator ? String(row.creator) : undefined,
      license: row.license ? String(row.license) : "creative-commons",
      licenseUrl: row.license_url ? String(row.license_url) : undefined,
      sourcePageUrl: row.foreign_landing_url ? String(row.foreign_landing_url) : undefined,
      tags,
      provider: "openverse" as const,
      width: row.width,
      height: row.height
    };
  });
}

async function searchUnsplash(query: string, limit: number): Promise<RawWebHit[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) return [];
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(15, limit)));
  url.searchParams.set("content_filter", "high");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      description?: string | null;
      alt_description?: string | null;
      urls?: { regular?: string; small?: string };
      user?: { name?: string; links?: { html?: string } };
      links?: { html?: string };
      width?: number;
      height?: number;
      tags?: Array<{ title?: string }>;
    }>;
  };
  return (json.results || []).map((row) => ({
    id: `unsplash:${row.id}`,
    url: String(row.urls?.regular || ""),
    thumbUrl: row.urls?.small,
    title: String(row.alt_description || row.description || "Dog photograph"),
    creator: row.user?.name,
    license: "Unsplash License (real photography)",
    licenseUrl: "https://unsplash.com/license",
    sourcePageUrl: row.links?.html || row.user?.links?.html,
    tags: (row.tags || []).map((t) => String(t.title || "")),
    provider: "unsplash" as const,
    width: row.width,
    height: row.height
  }));
}

async function searchPexels(query: string, limit: number): Promise<RawWebHit[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(15, limit)));
  const res = await fetch(url.toString(), {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(12_000)
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    photos?: Array<{
      id: number;
      alt?: string;
      url?: string;
      photographer?: string;
      photographer_url?: string;
      width?: number;
      height?: number;
      src?: { large?: string; medium?: string };
    }>;
  };
  return (json.photos || []).map((row) => ({
    id: `pexels:${row.id}`,
    url: String(row.src?.large || ""),
    thumbUrl: row.src?.medium,
    title: String(row.alt || "Dog photograph"),
    creator: row.photographer,
    license: "Pexels License (real photography)",
    licenseUrl: "https://www.pexels.com/license/",
    sourcePageUrl: row.url || row.photographer_url,
    tags: [],
    provider: "pexels" as const,
    width: row.width,
    height: row.height
  }));
}

function toCandidate(hit: RawWebHit, topic: string): BlogImageCandidate {
  const scene = [
    "Licensed web photograph · camera photo",
    hit.title,
    hit.creator ? `by ${hit.creator}` : null,
    hit.license ? `license: ${hit.license}` : null,
    `selected for topic: ${topic.slice(0, 80)}`
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    id: hit.id,
    sourceKind: "web_licensed",
    url: hit.url,
    thumbUrl: hit.thumbUrl || hit.url,
    alt: hit.title.slice(0, 140) || "Real dog photograph",
    caption: scene,
    sceneDescription: scene,
    photographer: hit.creator || null,
    license: hit.license || "licensed stock",
    licenseUrl: hit.licenseUrl || null,
    sourcePageUrl: hit.sourcePageUrl || null,
    tags: hit.tags || [],
    width: hit.width ?? null,
    height: hit.height ?? null
  };
}

/**
 * Search the public web for real (non-AI) dog photography.
 * Openverse works without keys; Unsplash/Pexels used when env keys exist.
 */
export async function searchWebDogPhotos(options?: {
  topic?: string;
  limit?: number;
}): Promise<BlogImageCandidate[]> {
  const limit = Math.min(24, Math.max(1, options?.limit ?? 10));
  const topic = String(options?.topic || "dog daycare").slice(0, 160);
  const queries = buildQueries(topic);
  const hits: RawWebHit[] = [];

  for (const query of queries.slice(0, 3)) {
    if (hits.length >= limit * 2) break;
    const batches = await Promise.allSettled([
      searchOpenverse(query, limit),
      searchUnsplash(query, Math.min(8, limit)),
      searchPexels(query, Math.min(8, limit))
    ]);
    for (const batch of batches) {
      if (batch.status === "fulfilled") hits.push(...batch.value);
    }
  }

  const seen = new Set<string>();
  const out: BlogImageCandidate[] = [];
  for (const hit of hits) {
    if (!acceptHit(hit)) continue;
    const key = hit.url.split("?")[0] || hit.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(toCandidate(hit, topic));
    if (out.length >= limit) break;
  }
  return out;
}
