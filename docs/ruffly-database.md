# Ruffly Database

Migration: `supabase/migrations/044_ruffly_core.sql`

Tables use the `ruffly_` prefix in `public` for isolation. Apply with:

```bash
npm run db:push -- 044_ruffly_core.sql
# or
npm run db:push:all
```

Key entities: contacts, conversations/messages, leads/tasks, review_requests/reviews/feedback, campaigns, automations, knowledge, AI sessions, call records, webchat visitors, consents/suppressions, provider_connections, webhook_events, sync_runs, job_queue, audit_logs.

Secrets: store provider tokens via env vars or `secret_ref` pointers — never plaintext access tokens in columns.

RLS is enabled on core tables; the Next.js app uses the Supabase service role server-side.
