# AI Providers

Automatic Blog talks to models through `lib/blog/ai/gateway.ts`. Gemini is the primary writing path. Other keys are optional and must be entered by Super Admin as real environment variables — **never invent, guess, or scrape keys**.

## Provider matrix

| Provider | Env var(s) | Role today |
|----------|------------|------------|
| **Gemini** (primary) | `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` | Active writer via shared Fitdog Gemini client |
| OpenAI | `OPENAI_API_KEY` | Detected; writing adapter activation pending |
| Anthropic | `ANTHROPIC_API_KEY` | Detected; writing adapter activation pending |
| Perplexity | `PERPLEXITY_API_KEY` | Detected; research-oriented use pending activation |
| Cursor | `CURSOR_API_KEY` | **Maintenance / development only** — not the sole article writer |
| none / fallback | — | Deterministic editorial template if AI fails |

Optional: `GEMINI_MODEL` for the shared client model name.

## Cursor key policy

- Super Admin pastes `CURSOR_API_KEY` into the host environment (Vercel / secrets store) manually.
- Agents and docs must **never** invent a Cursor key or scrape one from chat, files, or tooling.
- Connection test only reports whether the key is present server-side and reminds that Cursor is not the sole writer.
- Do not route production article generation solely through Cursor.

## How generation picks a provider

`generateBlogText()`:

1. Prefer requested provider, default **gemini**.
2. If Gemini is configured (either Gemini env key), map `GOOGLE_GENERATIVE_AI_API_KEY` → `GEMINI_API_KEY` when needed, then call `generateFitdogText`.
3. If another preferred provider is configured but not wired, throw a clear “adapter pending” error.
4. If nothing is configured, throw: add `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) in Vercel.

Draft pipeline (`runHumanFirstDraft`) catches AI failures and falls back to a deterministic draft so review can continue.

## Settings defaults

On `blog_settings`:

- `primary_provider` = `gemini`
- `evaluator_provider` = `gemini`

Independent evaluators currently use **rules-based** scorers (`human-score-v1`, agent review functions). That keeps the final Human Editorial gate from being “graded by the same model that wrote the draft.”

## Connection testing

`testBlogProviderConnection(provider)` returns:

| Status | Meaning |
|--------|---------|
| `connected` | Key present; Gemini additionally runs a ping |
| `not_configured` | Env var missing |
| `invalid_credentials` | Auth-style failure on live ping |
| `service_unavailable` | Other upstream failure |

Staff need `blog.manage_providers` (typically Super Admin). Never return raw secrets to the browser — only status.

## Cost tracking

- Estimated costs recorded on articles / `blog_agent_runs` / `blog_usage_records`.
- Caps: per-article, daily, weekly, monthly (see [OPERATIONS.md](./OPERATIONS.md)).
- View with `blog.view_costs`.

## Rotating credentials

1. Generate a new key in the provider console.
2. Update the Vercel env var (or secret store).
3. Redeploy / restart so server processes pick up the new value.
4. Run connection test in AI Providers.
5. Revoke the old key at the provider.
6. Audit: note rotation in `blog_audit_logs` if you track ops actions there.

If a key is leaked: emergency-off blog generation if needed, rotate immediately, review recent `blog_agent_runs` and publish attempts.
