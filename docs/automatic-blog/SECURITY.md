# Security

## Auth and RBAC

- Staff APIs require admin session (`requireBlogPermission` in `lib/blog/api-auth.ts`).
- Baseline permission: `blog.view`, plus the action-specific `blog.*` key.
- Super Admin (`owner_admin`) bypasses permission checks for access, but generation/publish still honor `emergency_off`.
- When `BLOG_ENABLED` is false/off/0, non–Super Admin requests get 403.
- Public `/blog` must not receive or require the staff session cookie.

## Secrets handling

| Secret | Storage | Notes |
|--------|---------|-------|
| `GEMINI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Server env | Never expose to browser |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY` | Server env | Optional |
| `CURSOR_API_KEY` | Server env | Super Admin manual entry only; never invent/scrape |
| `WORDPRESS_*` | Server env | Application password, not end-user password reuse in docs |
| `BLOG_PUBLISH_WEBHOOK_SECRET` | Server env | Sent as header only |
| `CRON_SECRET` | Server env | Bearer for cron routes |
| `FITDOG_BLOG_*` | Server env | Only real integration values |

Rules:

- Do not return secret values from admin APIs — only configured/not-configured status.
- Do not commit `.env` files or paste live keys into Notion/tickets/chat.
- Rotate on leak suspicion (see [OPERATIONS.md](./OPERATIONS.md)).

## Cron security

`/api/cron/blog-jobs` must reject unauthenticated callers. Accept:

- `Authorization: Bearer <CRON_SECRET>`, or
- Platform Vercel cron header

Never leave `CRON_SECRET` empty in production.

## Webhook SSRF controls

Publish webhook adapter:

- HTTPS only
- Rejects localhost and common private IP host patterns
- 20s timeout
- Idempotency key header for safe retries

Only point `BLOG_PUBLISH_WEBHOOK_URL` at trusted HTTPS endpoints you control or have contracted.

## Content integrity

- No fabricated stories, quotes, or statistics (editorial + fact-check agents).
- Fact-check agent flags medical/legal/high-risk language for manual review.
- Analytics snapshots must not invent rankings — connect real Search Console / analytics only when verified.

## Data isolation

- All blog tables use `blog_` prefix.
- Migration `054_automatic_blog.sql` does not alter DigiBoard / Ruffly core tables.
- Audit sensitive actions to `blog_audit_logs`.

## Least privilege

Grant marketing users only what they need (`BLOG_MARKETING_PERMISSIONS`). Restrict:

- `blog.manage_providers`
- `blog.manage_publishing`
- `blog.manage_automation`
- `blog.delete`
- `blog.view_costs` / `blog.view_audit_log` as appropriate

## Emergency response

1. Set `emergency_off = true`.
2. Optionally `BLOG_ENABLED=false`.
3. Rotate compromised credentials.
4. Cancel queued jobs.
5. Review recent audit + publish attempts.

See [OPERATIONS.md](./OPERATIONS.md) and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
