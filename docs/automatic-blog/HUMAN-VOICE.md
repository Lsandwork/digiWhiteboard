# Human Voice

Automatic Blog optimizes for writing that sounds like a careful Fitdog team member, not a marketing model.

## Default voice profile

Seeded as **Fitdog Team Default** (`fitdog-default`):

- Warm, knowledgeable, calm, caring, practical, honest, friendly
- Helpful before promotional
- Contractionsctions OK; moderate humor; local personality welcome
- Low promotional strength

Voice sliders live on `blog_voice_profiles.sliders` and `blog_settings.voice_sliders`.

## What “human” means here

| Do | Don’t |
|----|-------|
| Short, readable sentences | Uniform paragraph machines |
| Acknowledge owner stress | Blame (“you should have…”) |
| “Some dogs / your dog / depends” | Absolute always/never stacks |
| Light Fitdog mention when useful | Name-drop Fitdog every paragraph |
| Real examples in general form | Invented clients (“Meet Max”) |
| Read-aloud natural flow | Em-dash spam and stiff formality |

## Banned filler phrases

Enforced via `BANNED_FILLER_PHRASES` / Natural Voice scoring. Examples:

- “In today’s fast-paced world”
- “When it comes to”
- “It is important to note” / “It is worth noting”
- “Delve into” / “Dive into” / “Unlock the secrets” / “Unleash the power”
- “Ultimate guide” / “Comprehensive guide” / “Game changer”
- “Your furry companion” / “Whether you are a seasoned dog owner”
- “Rest assured” / “Look no further” / “At the end of the day”
- “In conclusion” / “To sum it all up” / “This article will explore”
- “Have you ever wondered” / “Did you know” / “Imagine this” / “Picture this”
- “Meet Max” / “You won’t believe” / “Stop scrolling”

Full list: `lib/blog/constants.ts`.

## Human Editorial Score (default threshold: 90)

Implemented in `lib/blog/editorial/human-score.ts`. Starts at 100; deductions include:

| Code | Typical cause |
|------|----------------|
| `filler_language` | Banned phrases |
| `generic_intro` | Opens with generic question |
| `fake_story` | Fabricated story patterns |
| `em_dash_overuse` | Too many em/en dashes |
| `long_sentences` / `choppy_sentences` | Unnatural rhythm |
| `repetitive_paragraphs` | Uniform paragraph lengths |
| `generic_conclusion` | Cookie-cutter ending |
| `promo_heavy` | Fitdog mentioned too often |
| `too_thin` / `too_long` | Length outside useful range |
| `missing_examples` | No actionable / example language |
| `one_size_fits_all` | No individual-difference language |
| `missing_professional_boundary` | Health content without vet/pro boundary |
| `repeated_opening` | Same opening as recent articles |
| `exaggeration` | “amazing / unmatched / the best” |
| `overly_formal` | Overuse of “canine” |

Also produces:

- **Natural voice score** — filler / intro / rhythm focused
- **Empathy score** — fake story / one-size / exaggeration focused
- **Read-aloud notes** — editorial hints for humans

Independent gate: `final_human_quality` agent. Drafts below threshold go to `NEEDS_CHANGES`.

## Writer instructions (AI path)

The Human-First Writer system prompt requires:

- Warm, practical, honest advice
- Never invent stories, quotes, staff opinions, client names, statistics, or studies
- Avoid banned filler and generic openings
- Acknowledge every dog is different
- Mention Fitdog only when natural
- Return structured JSON (title, excerpt, bodyMarkdown, SEO fields)
- At most 2–4 headings; must feel natural when read aloud

If AI is unavailable, a deterministic editorial template is used so the pipeline still produces a reviewable draft.

## Editing for voice

When rescoring (`rescoreArticle`):

1. Remove banned phrases.
2. Rewrite openings that start with generic questions.
3. Delete fabricated anecdotes.
4. Shorten stiff sentences; vary paragraph length.
5. Soften promo; add practical “try / start with” language.
6. Re-run score until ≥ 90 (or your configured threshold).
