# Troubleshooting

## Module won’t open / 403

| Symptom | Check |
|---------|-------|
| “Automatic Blog is disabled” | `BLOG_ENABLED` is `false`/`0`/`off`. Set `true` or omit. Super Admin can still access. |
| “requires a signed-in staff user” | Session missing `adminUserId` — re-login. |
| “do not have permission” | Grant `blog.view` + needed `blog.*` keys. |
| Page 404 | Confirm route `/admin/automatic-blog` deployed; path constant `BLOG_APP_PATH`. |

## Generation fails

| Error / symptom | Fix |
|-----------------|-----|
| “emergency stop is enabled” | Set `emergency_off = false` only if safe. |
| Topic Quality Score below threshold | Improve concern/takeaway/angle; score ≥ 85. |
| “No AI provider is configured” | Set `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, redeploy. |
| Provider “configured but not yet wired” | Use Gemini as writer; don’t force OpenAI/Anthropic until adapters are active. |
| Empty / low-quality draft | AI may have failed over to deterministic template — check `agentNotes` / `blog_agent_runs`. Rescore after human edit. |
| Lands in `NEEDS_CHANGES` | Human Editorial Score &lt; 90. Remove filler, fake stories, promo spam; rescore. |

## Scoring problems

- **Banned phrases:** search body against list in `lib/blog/constants.ts`.
- **Fake story deduction:** remove Imagine this / Meet Max / similar patterns.
- **Missing examples / one-size-fits-all:** add practical language and “every dog differs”.
- **Health content:** add veterinarian / qualified professional boundary.
- Re-run `rescoreArticle` after edits.

## Publish failures

| Error | Fix |
|-------|------|
| First N require APPROVED | Approve article; check `published_count` vs `manual_approval_first_n`. |
| Human Editorial Score below threshold | Edit + rescore before publish. |
| Cover image not approved | Approve in Image Approvals. |
| AI-generated images are disabled | Remove AI cover or use real approved media; keep `ai_images_enabled` false unless intentional. |
| WordPress is not configured | Set `WORDPRESS_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APPLICATION_PASSWORD`. |
| WordPress publish failed (status) | Check WP user capabilities, app password, REST enabled. |
| Webhook URL not configured / invalid / not https | Fix `BLOG_PUBLISH_WEBHOOK_URL`. |
| Webhook host not allowlisted | Don’t use localhost/private IPs. |
| Article status `FAILED` | Read `blog_publish_attempts.error` and status history note. |

## Cron / jobs

| Symptom | Fix |
|---------|------|
| 401 on `/api/cron/blog-jobs` | Send `Authorization: Bearer $CRON_SECRET` or use Vercel cron. |
| Jobs stuck `running` | Clear stale `locked_at`; reset to `queued` if worker died. |
| Jobs `failed` at max attempts | Fix root cause; insert new job or reset attempts carefully. |
| Nothing processes | Confirm cron schedule deployed; `emergency_off` false; queue has `run_after <= now()`. |

Recover example:

```sql
-- inspect
select id, job_type, status, attempts, max_attempts, last_error, run_after
from blog_generation_jobs
order by created_at desc
limit 20;

-- requeue one failed job if attempts remain
update blog_generation_jobs
set status = 'queued',
    locked_at = null,
    run_after = now(),
    updated_at = now()
where id = '<job-id>'
  and status = 'failed'
  and attempts < max_attempts;
```

## Public blog empty / missing

- Confirm article `status = 'PUBLISHED'`.
- Confirm `BLOG_PUBLIC_ENABLED` not off.
- Confirm slug URL `/blog/{slug}` and `NEXT_PUBLIC_SITE_URL` for displayed links.
- Native adapter does not push to WordPress — check destination if you expected WP.

## Provider connection test

- Gemini `not_configured` → missing env key.
- `invalid_credentials` → rotate key; do not invent a new one.
- Cursor `connected` only means key present — not that Cursor should write all articles.

## Consent / media

- Publish blocked on cover → approval_status must be `approved`.
- Member photo complaints → expire consent, swap cover, document in audit.
- Don’t confuse Ruffly SMS consent with blog photo consent.

## Emergency checklist

1. `emergency_off = true`
2. `BLOG_ENABLED=false` if staff must stop using the module
3. Cancel queued jobs
4. Rotate any suspected leaked keys (Gemini, WordPress, webhook, cron, Cursor)
5. Review last 24h `blog_audit_logs`, `blog_publish_attempts`, `blog_agent_runs`
6. Fix root cause → re-enable deliberately

## Still stuck?

Gather before escalating:

- Article id / topic id / job id
- Exact error string
- `blog_settings` toggles (emergency, auto-publish, AI images, thresholds, published_count)
- Whether Gemini env keys are present (yes/no — never paste the key)
- Destination (`native` / `wordpress` / `webhook`)
- Recent deploy time
