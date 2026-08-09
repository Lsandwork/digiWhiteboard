# Image Policy

## Hard rule: real photography only

AI-generated images are **blocked** for blog and social. They look fake and undermine Fitdog’s brand.

Blog Generator and Social Media Generator automatically:

1. Prefer photos from **Digi Board Bulk Photo Upload** (`photo_upload_items`)
2. Fill remaining slots with **licensed web photography** (Openverse; optional Unsplash / Pexels keys)
3. Write captions/articles so the copy **matches those scenes**
4. Reject titles/tags/URLs that look AI-generated (Midjourney, DALL·E, etc.)

`blog_settings.ai_images_enabled` is forced **false** in the settings API.

## What is allowed by default

| Allowed | Notes |
|---------|-------|
| Fitdog-owned photos | Preferred |
| Licensed stock / photographer | With license notes |
| Partner-provided | Documented permission |
| Member / employee submitted | Only with valid consent |

| Blocked by default | Notes |
|--------------------|-------|
| AI-generated covers | Even if marked `ai_generated_approved`, publish fails while AI images are off |
| Unapproved assets | Any `approval_status != approved` |
| Expired assets | Treat as unusable |

## If AI images are ever enabled

Only Super Admin should flip `ai_images_enabled`:

1. Document why (ops note / audit).
2. Require `source_class = ai_generated_approved` **and** human `blog.approve_images`.
3. Disclose appropriately if public AI disclosure text is set (`public_ai_disclosure` on settings).
4. Never use AI to fabricate identifiable “clients” or fake facility rooms presented as real.
5. Keep synthetic flags populated on the asset.
6. Prefer turning the setting back off when the experiment ends.

## Article image review

- Status field: `image_review_status`
- Pipeline statuses: `IMAGE_SELECTION`, `IMAGE_REVIEW`
- Human reviewers confirm: subject accuracy, consent, alt text, no misleading staging

## Alt text and captions

- Describe the scene for accessibility; don’t stuff keywords.
- Don’t invent details you can’t see (“Max the Labrador” unless verified and consented naming is appropriate).

## Related publish rules

Cover checks run inside `publishBlogArticle` before the adapter is called. Failed image policy → error, article can move to `FAILED` if publish already started — prefer catching in Image Approvals before clicking Publish.
