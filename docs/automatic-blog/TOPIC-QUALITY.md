# Topic Quality

Weak topics produce weak articles. Automatic Blog scores topics before generation and rejects generic ideas.

## Default threshold: 85

Configured on `blog_settings.topic_score_threshold` (default **85**). Generation via `generateArticleFromTopic` throws if the topic score is below threshold.

## What a good topic has

Required fields for a strong score:

| Field | Why |
|-------|-----|
| **Title** | Specific, non-cliché, not duplicate |
| **Reader concern** | ≥ ~20 characters of real owner worry |
| **Primary takeaway** | Clear, actionable outcome |
| **Angle** | Specific lens (≥ ~15 characters) |
| **Pillar** | Assigned content pillar |
| **Local relevance** | Optional but helpful (Santa Monica / LA / SoCal) |

## Score breakdown

From `lib/blog/editorial/topic-score.ts`:

| Dimension | Base points |
|-----------|-------------|
| Usefulness | 20 |
| Specificity | 15 |
| Originality | 15 |
| Depth potential | 15 |
| Fitdog expertise | 10 |
| Local relevance | 10 |
| Actionability | 15 |

Deductions apply for thin concern/takeaway/angle, cliché titles, duplicates, missing pillar, missing local note.

## Hard rejects (weak topics)

These patterns score ~20 and are rejected immediately:

- “Why dogs are great”
- “Five reasons to love dogs”
- “Everything you need to know about dogs”
- “The ultimate dog guide”
- “Why dog daycare is amazing”
- “Top ten dog tips”
- “Fun facts about dogs”

Also flagged: titles leaning on “ultimate”, “comprehensive”, “everything about”, “top N”.

## Statuses

| Status | Meaning |
|--------|---------|
| `idea` | Below threshold or incomplete |
| `scored` | Meets threshold; eligible for briefs |
| `approved` | Editorial approved for calendar |
| `rejected` | Explicitly rejected |
| `used` | Already generated into an article |
| `archived` | Retired |

## Seed topics

`seedBlogTopics()` inserts scored seeds from `lib/blog/topics/seed-topics.ts` (skips exact title duplicates). Seeds are specific Fitdog-relevant angles, for example:

- How to tell when your dog needs a break from group play
- What to pack for your dog’s first boarding stay
- Why rest matters just as much as exercise for active dogs

## Process for staff

1. Submit idea (`blog.submit_idea`) or create topic (`blog.create`).
2. Review Topic Quality Score + breakdown in Topic Ideas.
3. If below 85: sharpen concern, takeaway, angle; assign pillar; add local relevance if true.
4. Only then Generate Article.

## Calendar hygiene

- Prefer one strong angle over many thin listicles.
- Don’t duplicate published titles.
- Seasonal topics should still name a concrete owner problem (not “Holiday tips for dogs”).
