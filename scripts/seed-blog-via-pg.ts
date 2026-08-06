/**
 * Seed Automatic Blog launch content using the Postgres password (no service role key required).
 */
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";
import { INITIAL_BLOG_ARTICLES } from "../lib/blog/content/initial-articles";
import { BLOG_SEED_TOPICS } from "../lib/blog/topics/seed-topics";
import { scoreTopicQuality } from "../lib/blog/editorial/topic-score";
import { markdownToSimpleHtml } from "../lib/blog/utils/markdown";
import { DEFAULT_TOPIC_SCORE_THRESHOLD } from "../lib/blog/constants";

loadEnvFiles();

const PROJECT_REF = "tzkocaucqtmmnrttxira";

function buildDatabaseUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (!password?.trim()) return null;
  const usePooler = process.env.SUPABASE_USE_DIRECT !== "true";
  const host =
    process.env.SUPABASE_DB_HOST ??
    (usePooler ? "aws-0-us-east-1.pooler.supabase.com" : `db.${PROJECT_REF}.supabase.co`);
  const port = process.env.SUPABASE_DB_PORT ?? "5432";
  const user = process.env.SUPABASE_DB_USER ?? (usePooler ? `postgres.${PROJECT_REF}` : "postgres");
  const database = process.env.SUPABASE_DB_NAME ?? "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password.trim())}@${host}:${port}/${database}`;
}

async function main() {
  const databaseUrl = buildDatabaseUrl();
  if (!databaseUrl) throw new Error("Missing SUPABASE_DB_PASSWORD");

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected for blog seed.");

  // Pillar map
  const pillars = await client.query<{ id: string; slug: string }>(`select id, slug from blog_content_pillars`);
  const pillarMap = new Map(pillars.rows.map((row) => [row.slug, row.id]));

  const existingTopics = await client.query<{ title: string }>(`select title from blog_topics`);
  const existingTitles = new Set(existingTopics.rows.map((row) => row.title.toLowerCase()));

  let topicsInserted = 0;
  for (const topic of BLOG_SEED_TOPICS) {
    if (existingTitles.has(topic.title.toLowerCase())) continue;
    const scored = scoreTopicQuality({
      title: topic.title,
      readerConcern: topic.readerConcern,
      primaryTakeaway: topic.primaryTakeaway,
      angle: topic.angle,
      localRelevance: topic.localRelevance,
      pillar: topic.pillar,
      existingTitles: [...existingTitles]
    });
    await client.query(
      `insert into blog_topics
        (title, working_title, pillar_id, audience, reader_concern, primary_takeaway, angle, tone_preset, local_relevance,
         topic_quality_score, topic_score_breakdown, status, source_mode, created_by)
       values ($1,$1,$2,'dog_owners',$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'seed','seed-via-pg')`,
      [
        topic.title,
        pillarMap.get(topic.pillar) ?? null,
        topic.readerConcern,
        topic.primaryTakeaway,
        topic.angle,
        topic.tonePreset,
        topic.localRelevance ?? "",
        scored.score,
        JSON.stringify(scored.breakdown),
        scored.score >= DEFAULT_TOPIC_SCORE_THRESHOLD ? "scored" : "idea"
      ]
    );
    existingTitles.add(topic.title.toLowerCase());
    topicsInserted += 1;
  }
  console.log(`Topics inserted: ${topicsInserted}`);

  let articlesUpserted = 0;
  for (const article of INITIAL_BLOG_ARTICLES) {
    const bodyHtml = markdownToSimpleHtml(article.bodyMarkdown);
    const existing = await client.query<{ id: string }>(`select id from blog_articles where slug = $1`, [article.slug]);
    const params = [
      article.title,
      article.slug,
      article.excerpt,
      article.bodyMarkdown,
      bodyHtml,
      "PUBLISHED",
      "dog_owners",
      article.authorProfile,
      article.seoTitle,
      article.metaDescription,
      article.coverAlt,
      article.coverImage,
      article.categorySlug,
      article.categorySlug,
      article.featured,
      article.readingMinutes,
      article.publishedAt,
      `/blog/${article.slug}`,
      94,
      92,
      93,
      92,
      "seed_editorial_reviewed",
      "approved_fitdog_owned",
      JSON.stringify({
        drafting: false,
        research: false,
        seo: false,
        note: "Initial editorial seed written for launch; not an automated AI draft."
      })
    ];

    if (existing.rows[0]?.id) {
      await client.query(
        `update blog_articles set
          title=$1, excerpt=$3, body_markdown=$4, body_html=$5, status=$6, audience=$7, author_profile=$8,
          seo_title=$9, meta_description=$10, cover_alt=$11, cover_image_path=$12, category_slug=$13,
          content_pillar=$14, featured=$15, reading_minutes=$16, published_at=$17, published_url=$18,
          human_editorial_score=$19, topic_quality_score=$20, natural_voice_score=$21, empathy_score=$22,
          fact_check_status=$23, image_review_status=$24, ai_assistance=$25::jsonb, updated_at=now()
         where slug=$2`,
        params
      );
    } else {
      await client.query(
        `insert into blog_articles
          (title, slug, excerpt, body_markdown, body_html, status, audience, author_profile, seo_title, meta_description,
           cover_alt, cover_image_path, category_slug, content_pillar, featured, reading_minutes, published_at, published_url,
           human_editorial_score, topic_quality_score, natural_voice_score, empathy_score, fact_check_status,
           image_review_status, ai_assistance, created_by)
         values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,'seed-via-pg')`,
        params
      );
    }
    articlesUpserted += 1;
  }
  console.log(`Articles upserted: ${articlesUpserted}`);

  await client.query(
    `update blog_settings set
      enabled = true,
      setup_completed = true,
      setup_step = 18,
      auto_publish_enabled = false,
      ai_images_enabled = false,
      emergency_off = false,
      published_count = greatest(published_count, $1),
      updated_at = now()
     where id = 'default'`,
    [INITIAL_BLOG_ARTICLES.length]
  );

  const settings = await client.query(`select enabled, auto_publish_enabled, ai_images_enabled, published_count from blog_settings where id='default'`);
  const counts = await client.query(`select status, count(*)::int as c from blog_articles group by status`);
  console.log("Settings:", settings.rows[0]);
  console.log("Article counts:", counts.rows);
  await client.end();
  console.log("Blog seed complete.");
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
