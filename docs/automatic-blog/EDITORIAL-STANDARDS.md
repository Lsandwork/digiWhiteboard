# Editorial Standards

Fitdog Automatic Blog exists to help dog owners with practical, honest advice — not to ship generic SEO filler.

## Purpose

Every article should:

1. Address a real owner concern.
2. Teach something useful they can try this week.
3. Stay within Fitdog’s expertise (daycare, boarding, training, enrichment, grooming, local dog life, service explanations).
4. Sound like a knowledgeable, calm staff member — not a content mill.

## Non-negotiables

- **No fake stories** — no “Meet Max”, “Imagine this”, invented clients, or made-up staff anecdotes.
- **No fake quotes** — no unnamed “experts agree” / “veterinarians say” without a real, cited source.
- **No fake stats** — no percentages or “study shows” claims unless the study is in `blog_research_sources` and verified.
- **No medical diagnosis or legal advice** — health-adjacent content must point to a vet / qualified professional.
- **No fear bait** — avoid terrified / deadly / disastrous framing.
- **Helpful before promotional** — Fitdog mentions stay light and optional.
- **Every dog is different** — avoid one-size-fits-all absolutes.

## Content pillars (seeded)

| Pillar slug | Focus |
|-------------|--------|
| `puppy-care` | Routines, socialization, first experiences |
| `daycare-education` | Responsible daycare and preparation |
| `boarding-preparation` | Overnight stay readiness |
| `training` | Kind, practical training |
| `enrichment` | Mental stimulation and rest balance |
| `outdoor-safety` | Heat, pavement, beaches, SoCal outings |
| `grooming` | Coat, nails, comfort |
| `seasonal-care` | Holidays, weather, schedule changes |
| `senior-rescue` | Adjustment, mobility, confidence |
| `local-guides` | Santa Monica & LA dog-owner guidance |
| `fitdog-services` | Clear service explanations |

## Tone presets

Examples from `BLOG_TONE_PRESETS`: new puppy support, training advice, health-conscious guidance, boarding preparation, daycare education, grooming guidance, seasonal safety, local dog owner guide, sensitive owner concern, service explanation, member story, light community article, senior dog care, rescue dog adjustment.

Use the preset that matches the reader’s emotional state. Sensitive topics get calmer, less promotional language.

## Structure guidelines

- Open with the owner’s concern in plain language (not a generic question).
- 2–4 headings max for most posts.
- Include concrete steps (`try`, `start with`, `consider`, `watch for`).
- Include at least one realistic example **without inventing a named client**.
- Close with when to get professional help if relevant — not “In conclusion”.
- Target roughly 280–1800 words of useful content (too thin / padded are scored down).

## Knowledge base

Public claims about Fitdog operations should come from approved `blog_knowledge_entries` with `public_use_allowed = true`. Do not invent program details, prices, or guarantees.

## Review checklist (human)

Before approving:

1. Would a real dog owner find this helpful?
2. Does it show genuine care?
3. Does it sound natural when read aloud?
4. Is Fitdog promotion natural or absent?
5. Would a Fitdog employee put their name on this?
6. Are all stats / quotes / stories real and sourced?
7. Cover image approved and consented (if any)?

## Score gates

- Topic Quality Score ≥ **85** before generation.
- Human Editorial Score ≥ **90** before approval / publish.
- First **25** published articles require explicit **APPROVED** status.

See [HUMAN-VOICE.md](./HUMAN-VOICE.md) and [TOPIC-QUALITY.md](./TOPIC-QUALITY.md).
