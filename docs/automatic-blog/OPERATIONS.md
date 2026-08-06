# Operations

Day-to-day runbook for Automatic Blog on RuffOps.

## Daily checks (when actively publishing)

1. **Failed** queue — articles in `FAILED` and jobs in `failed`.
2. **Human Review** / **Needs Changes** — clear blockers.
3. **Image Approvals** — pending covers.
4. **Cost and Usage** — month-to-date vs monthly cap.
5. **Audit Log** — unexpected publishes or setting changes.

## Settings that should stay conservative

| Setting | Recommended |
|---------|-------------|
| `auto_publish_enabled` | `false` until warm-up complete |
| `ai_images_enabled` | `false` |
| `human_score_threshold` | `90` |
| `topic_score_threshold` | `85` |
| `manual_approval_first_n` | `25` |
| `max_articles_per_week` | `7` (or lower) |
| `emergency_off` | `false` only when healthy |

## Emergency off

Stops generation and publishing immediately (`generateArticleFromTopic` / `publishBlogArticle` throw).

**Admin:** Settings → enable emergency stop (or equivalent control).

**SQL:**

```sql
update blog_settings
set emergency_off = true, updated_at = now()
where id = 'default';
```

Optional staff lockout:

```text
BLOG_ENABLED=false
```

Cancel in-flight work:

```sql
update blog_generation_jobs
set status = 'cancelled', updated_at = now()
where status in ('queued', 'running');
```

Re-enable only after root cause is fixed; set `emergency_off = false` deliberately.

## Rotate credentials

For Gemini / OpenAI / Anthropic / Perplexity / Cursor / WordPress / webhook / cron:

1. Create new secret at provider.
2. Update Vercel env (or secret manager).
3. Redeploy.
4. Connection-test providers; publish a staging webhook ping if applicable.
5. Revoke old secret.
6. If leak: emergency-off first, then rotate, then review `blog_agent_runs` + `blog_publish_attempts` + audit log.

Never invent replacement keys. Super Admin enters real values only.

## Recover failed jobs

1. Read `blog_generation_jobs.last_error` and `blog_articles.error_history` / status history.
2. Fix underlying issue (provider key, score, image approval, destination config).
3. If attempts &lt; max: reset job:

```sql
update blog_generation_jobs
set status = 'queued',
    run_after = now(),
    locked_at = null,
    last_error = null,
    updated_at = now()
where id = '<job-id>'
  and attempts < max_attempts;
```

4. Or create a fresh job / re-run generate or publish from admin with `blog.create` / `blog.publish`.
5. For publish failures: check `blog_publish_attempts` by `idempotency_key` before retrying external destinations to avoid duplicates.

## Cost caps

Defaults from migration:

| Cap | Default (cents) |
|-----|-----------------|
| Per article | 250 |
| Daily | 2500 |
| Weekly | 10000 |
| Monthly | 30000 |

If approaching caps: pause generation, lower `max_articles_per_week`, or emergency-off. Investigate outlier `blog_usage_records`.

## First 25 articles

Track `published_count` on settings. Until it reaches 25:

- Require human approval before publish.
- Prefer native destination only.
- Keep auto-publish off.
- Treat process bugs as blockers, not noise.

## Public AI disclosure

Optional `blog_settings.public_ai_disclosure` — use when you disclose AI assistance on public pages. Keep accurate; don’t claim “100% human” if drafting used Gemini.

## Hosts

| Host | Role |
|------|------|
| `staff.ruffops.com` | Admin at `/admin/automatic-blog` |
| `ruffops.com` | Staff routing as configured by middleware |
| Public site `/blog` | Native reader surface |

Keep lobby / CAST-TV unaffected when changing blog env vars.
