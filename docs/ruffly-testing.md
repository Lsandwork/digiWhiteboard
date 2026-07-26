# Ruffly Testing

```bash
npx tsx scripts/test-ruffly-core.ts
npx tsx scripts/test-ruffly-domain-routing.ts
npm run typecheck
npm run lint
npm run build
```

Covers: domain rewrite, opt-out detection, review no-gating, webhook signature/idempotency helpers, AI handoff signals, permissions presence.
