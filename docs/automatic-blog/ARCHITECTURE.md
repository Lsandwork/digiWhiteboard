# Architecture

Automatic Blog is an in-repo module of the Fitdog RuffOps Next.js + Supabase app. It uses isolated `blog_*` tables and does not alter DigiBoard / Ruffly core schemas.

## Surfaces

```
Staff UI     /admin/automatic-blog     (staff.ruffops.com / ruffops.com)
Public blog  /blog                     native adapter
Public post  /blog/{slug}
Cron         /api/cron/blog-jobs       Bearer CRON_SECRET or Vercel cron header
Domain       lib/blog/*
Migration    supabase/migrations/054_automatic_blog.sql
```

Staff auth reuses the existing admin session (`fitdog_admin_session`). Public `/blog` never requires that cookie.

## Layer diagram

```
┌─────────────────────────────────────────────────────────┐
│  Admin UI (/admin/automatic-blog)                        │
│  Overview · Calendar · Topics · Drafts · Review · Media │
└───────────────────────────┬─────────────────────────────┘
                            │ blog.* permissions
┌───────────────────────────▼─────────────────────────────┐
│  Service layer (lib/blog/service.ts)                     │
│  settings · topics · generate · rescore · publish · audit│
└───────┬─────────────┬──────────────┬────────────────────┘
        │             │              │
   AI gateway    Editorial       Publishing
   (Gemini+)     scores/agents   adapters
        │             │              │
┌───────▼─────────────▼──────────────▼────────────────────┐
│  Postgres blog_* tables + blog_generation_jobs queue     │
└─────────────────────────────────────────────────────────┘
```

## Core tables

| Table | Role |
|-------|------|
| `blog_settings` | Feature toggles, thresholds, cost caps, providers, brand/editorial JSON |
| `blog_content_pillars` | Content pillars (seeded: puppy care, daycare, boarding, training, …) |
| `blog_voice_profiles` | Brand voice sliders + banned phrases |
| `blog_knowledge_entries` | Approved Fitdog statements for public/internal use |
| `blog_topics` | Ideas with Topic Quality Score |
| `blog_content_briefs` | Structured brief payload per topic |
| `blog_research_sources` | Cited sources (no invented studies) |
| `blog_articles` | Drafts through published posts |
| `blog_article_versions` | Version snapshots |
| `blog_status_history` | Status transitions |
| `blog_agent_runs` | Per-agent run log (writer, evaluators) |
| `blog_generation_jobs` | Durable job queue (`queued` → `running` → `succeeded`/`failed`) |
| `blog_media_assets` | Media library with source class + approval |
| `blog_media_consents` | Consent records linked to media |
| `blog_publish_destinations` | native / wordpress / webhook / export |
| `blog_publish_attempts` | Idempotent publish attempts |
| `blog_usage_records` | AI cost tracking |
| `blog_audit_logs` | Actor + action audit trail |
| `blog_analytics_snapshots` | Verified metrics only (no fabricated rankings) |

Default settings row: `blog_settings.id = 'default'`.

## Article status machine

Statuses (from `lib/blog/constants.ts`):

```
IDEA → TOPIC_REVIEW → BRIEF_GENERATING → BRIEF_READY
  → RESEARCHING → RESEARCH_READY → OUTLINING → DRAFTING
  → PRACTICAL_REVIEW → EMPATHY_REVIEW → EDITING
  → NATURAL_VOICE_REVIEW → SEO_REVIEW → FACT_CHECK → BRAND_REVIEW
  → IMAGE_SELECTION → IMAGE_REVIEW → HUMAN_REVIEW
  → NEEDS_CHANGES | APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
  → FAILED | ARCHIVED
```

In the current generation path (`generateArticleFromTopic`):

1. Topic must meet Topic Quality threshold.
2. Brief is inserted.
3. Human-First draft runs.
4. Article lands in **`HUMAN_REVIEW`** if Human Editorial Score ≥ threshold, else **`NEEDS_CHANGES`**.
5. Publish moves through **`PUBLISHING`** → **`PUBLISHED`** (or **`FAILED`**).

## Multi-agent workflow

Agents are **independent evaluators**. The writer does not grade its own work as the final gate.

| Agent | Module | Job |
|-------|--------|-----|
| Human-First Writer | `pipeline/draft-article.ts` | Draft body (AI or deterministic fallback) |
| Dog-Owner Empathy | `agents/reviews.ts` | Judgment, fear language, concern acknowledgment |
| Practical Advice | `agents/reviews.ts` | Actionable steps and examples |
| Natural Voice Evaluator | `agents/reviews.ts` | Filler, fake stories, read-aloud notes (score only) |
| Fact-Check / Safety | `agents/reviews.ts` | Stats, unnamed authority, medical/legal flags |
| Brand Voice | `agents/reviews.ts` | Promo balance, banned phrases |
| SEO | `agents/reviews.ts` | Keyword hygiene — never invents rankings |
| Final Human Quality | `agents/reviews.ts` + `editorial/human-score.ts` | Independent Human Editorial Score gate |

`blog_agent_runs` stores each run with `agent_name`, provider/model, score, and cost.

## Scoring gates

| Score | Default threshold | Enforced when |
|-------|-------------------|---------------|
| Topic Quality Score | 85 | Creating/using topics for generation |
| Human Editorial Score | 90 | Draft acceptance + publish |

Settings live on `blog_settings` (`topic_score_threshold`, `human_score_threshold`).

## Publishing adapters

`lib/blog/publishing/adapters.ts`:

| Provider | Behavior |
|----------|----------|
| `native` (default) | Marks article published; public URL `{site}/blog/{slug}` |
| `wordpress` | `POST` to WordPress REST `/wp-json/wp/v2/posts` with Basic auth (app password) |
| `webhook` | HTTPS POST with idempotency key + optional shared secret; SSRF-guarded |

Publish attempts are upserted by `idempotency_key` on `blog_publish_attempts`.

## Feature flags

| Flag | Location | Effect |
|------|----------|--------|
| `BLOG_ENABLED` | env | Non–Super Admin staff APIs blocked when off |
| `BLOG_PUBLIC_ENABLED` | env | Public blog surface |
| `enabled` | `blog_settings` | Module operational toggle |
| `auto_publish_enabled` | `blog_settings` | Default **false** |
| `ai_images_enabled` | `blog_settings` | Default **false** |
| `emergency_off` | `blog_settings` | Blocks generate + publish |
| `manual_approval_first_n` | `blog_settings` | Default **25** |

## Cost controls (settings)

- `max_cost_per_article_cents` (default 250)
- `daily_cost_limit_cents` (2500)
- `weekly_cost_limit_cents` (10000)
- `monthly_cost_limit_cents` (30000)
- `max_articles_per_week` (7)

Usage is recorded in `blog_usage_records` / agent run `cost_cents`.

## Isolation rules

- Prefix all persistence with `blog_`.
- Do not write secrets into browser responses.
- Do not invent credentials or scrape keys from Cursor / other tools.
- Keep lobby / CAST-TV / DigiBoard / Ruffly paths untouched.
