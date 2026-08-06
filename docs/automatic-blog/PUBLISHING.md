# Publishing

Automatic Blog can ship articles to three destinations. Default is **native**.

## Destinations

Seeded in `blog_publish_destinations`:

| Provider | Default active | Description |
|----------|----------------|-------------|
| `native` | Yes | Fitdog blog at `/blog` |
| `wordpress` | No | WordPress REST API |
| `webhook` | No | Protected HTTPS webhook |
| `export` | — | Supported in schema for future export flows |

Per-article override: `blog_articles.publish_destination`. Settings default: `blog_settings.publish_provider` (`native`).

## Native adapter

`publishNative()` builds:

```text
{NEXT_PUBLIC_SITE_URL}/blog/{slug}
```

It marks the article published in-app. Public readers use the native `/blog` surface when `BLOG_PUBLIC_ENABLED` allows it.

Requirements:

- Unique `slug`
- Article passes Human Editorial Score threshold
- Cover media (if set) approved; AI-generated covers blocked unless `ai_images_enabled`
- First **25** publishes require status `APPROVED` or `SCHEDULED` (see `manual_approval_first_n` / `published_count`)

## WordPress REST

Env:

```text
WORDPRESS_URL=
WORDPRESS_USERNAME=
WORDPRESS_APPLICATION_PASSWORD=
```

Behavior:

- `POST {WORDPRESS_URL}/wp-json/wp/v2/posts`
- Basic auth with application password
- Sends title, slug, excerpt, HTML content, `status: publish`
- 20s timeout
- Returns WP `link` / `id` on success

Leave destination inactive until credentials are verified on a staging WP site.

## Webhook

Env:

```text
BLOG_PUBLISH_WEBHOOK_URL=
BLOG_PUBLISH_WEBHOOK_SECRET=
```

Request:

- Method: `POST`
- Headers: `Content-Type: application/json`, `X-RuffOps-Idempotency-Key`, optional `X-RuffOps-Webhook-Secret`
- Body: publish payload (title, slug, excerpt, html, SEO fields, timestamps, canonical path)

SSRF guards:

- HTTPS only
- Rejects localhost / private host patterns

## Publish flow

`publishBlogArticle()`:

1. Reject if `emergency_off`.
2. Enforce first-N manual approval rule.
3. Enforce Human Editorial Score ≥ threshold.
4. Validate cover media approval / AI image policy.
5. Transition to `PUBLISHING`.
6. Call adapter with idempotency key `blog-publish-{articleId}-{version}`.
7. Upsert `blog_publish_attempts`.
8. On failure → `FAILED` + throw.
9. On success → `PUBLISHED`, set `published_url`, increment `published_count`, write audit log.

## Idempotency

Retries with the same idempotency key should not create duplicate external posts when the destination respects the key (webhook header) or when you inspect `blog_publish_attempts` before re-firing.

## Permissions

- Configure destinations: `blog.manage_publishing`
- Publish action: `blog.publish`
- Schedule: `blog.schedule`

## Auto-publish

`auto_publish_enabled` defaults **false**. Do not enable until:

- First 25 articles were manually approved and published cleanly
- Scores and image policy are trusted
- Destinations are correctly configured
- Someone is on-call to watch Failed + audit log

See [AUTOMATION.md](./AUTOMATION.md).
