# Media Library

Admin page: **Media Library** (`blog.manage_media`). Approvals: **Image Approvals** (`blog.approve_images`).

## Table: `blog_media_assets`

| Field | Purpose |
|-------|---------|
| `storage_path` / `public_url` | Where the file lives |
| `source_class` | Provenance (see below) |
| `photographer` | Credit |
| `license_notes` / `usage_restrictions` | Legal / usage text |
| `consent_id` | Link to `blog_media_consents` |
| `uploaded_by` | Staff actor |
| `approval_status` | `pending` / `approved` / `rejected` / `expired` |
| `alt_text` / `caption` / `tags` | Accessibility + findability |
| `activity` / `orientation` / `season` | Editorial filters |
| `synthetic_flags` | Mark synthetic / AI traits if any |
| `expires_at` | License or consent expiry |
| `usage_count` | How often used |

## Source classes

Allowed `source_class` values:

| Class | Meaning |
|-------|---------|
| `fitdog_owned` | Fitdog-owned photography |
| `member_submitted` | Member-provided (consent required) |
| `employee_submitted` | Staff-provided (still consent subjects if people/dogs identifiable) |
| `licensed_stock` | Paid stock with license notes |
| `photographer_licensed` | Pro photographer license |
| `partner_provided` | Partner assets with documented permission |
| `ai_generated_approved` | AI image that passed explicit approval — still blocked if AI images setting is off |

## Approval workflow

1. Upload / register asset → `approval_status = pending`.
2. Reviewer with `blog.approve_images` checks consent, license, alt text, authenticity.
3. Approve or reject.
4. Articles may only use **approved** covers at publish time.
5. Expired consent/license → mark `expired`; do not reuse.

Publish enforcement (`publishBlogArticle`):

- Cover present + not approved → publish blocked.
- Cover `ai_generated_approved` while `ai_images_enabled = false` → publish blocked.

## Linking to articles

- `blog_articles.cover_media_id`
- `blog_articles.cover_alt`
- `image_review_status` on the article (`pending` by default)

Image stages in the status machine: `IMAGE_SELECTION` → `IMAGE_REVIEW`.

## Good library hygiene

- Prefer real Fitdog facility / training / community photos.
- Always set meaningful `alt_text`.
- Tag by activity (daycare, boarding, training, grooming) and season.
- Keep license notes short and accurate.
- Link consent whenever a recognizable dog or person appears in public posts.
- Do not upload screenshots of private chat or medical records.

See [IMAGE-POLICY.md](./IMAGE-POLICY.md) and [CONSENT.md](./CONSENT.md).
