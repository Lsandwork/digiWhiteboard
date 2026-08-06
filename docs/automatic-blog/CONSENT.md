# Consent

Public blog media that shows identifiable dogs, owners, or staff needs documented consent. Automatic Blog stores consent separately from assets.

## Table: `blog_media_consents`

| Field | Purpose |
|-------|---------|
| `subject_type` | What/who is depicted (dog, person, group, etc.) |
| `subject_label` | Human-readable label (not a place to store secrets) |
| `granted_by` | Who granted consent |
| `granted_at` | When granted |
| `expires_at` | Optional expiry |
| `scope` | Default `public_blog` |
| `notes` | Limits (no name, no face, facility-only, etc.) |

Assets reference consent via `blog_media_assets.consent_id`.

## When consent is required

| Situation | Consent? |
|-----------|----------|
| Fitdog-owned facility shot with no identifiable private individual | Usually OK as owned media; still respect staff photo preferences |
| Member’s dog clearly identifiable | **Yes** — member / guardian consent |
| Owner face or child in frame | **Yes** — explicit, preferably written |
| Employee in promotional blog photo | Confirm staff policy / permission |
| Partner brand marks | Partner permission + license notes |
| Stock photography | License covers commercial web use |

## Scope

Default scope `public_blog` means: Fitdog may use the asset on the public Automatic Blog / native `/blog` surfaces. Do not stretch consent silently to ads, billboards, or resale without checking notes / getting broader permission.

## Expiry and withdrawal

1. If `expires_at` passes → set related media `approval_status = expired` (or reject).
2. If consent withdrawn → remove from library usage, unpublish or swap covers on live posts if needed, note in audit log.
3. Do not keep using a photo “because it was already published” without a retention decision from management.

## Knowledge vs media consent

- `blog_knowledge_entries.public_use_allowed` gates **statements**, not photos.
- Media consent gates **imagery**.
- Both must be clean for a post that makes Fitdog claims and shows real members.

## Staff practice

1. Collect consent before upload when possible.
2. Create `blog_media_consents` row; link on the asset.
3. Approve image only after consent + license check.
4. Keep notes short: what is allowed, what is not (e.g. “dog OK, owner face cropped”).

## Related systems

Ruffly has its own marketing/SMS consent model (`ruffly_consents`). That is **separate**. Blog photo consent does not imply SMS/email marketing opt-in, and vice versa.
