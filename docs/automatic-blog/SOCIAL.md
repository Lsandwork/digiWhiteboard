# Social Media Generator

Admin tab: **Social Media Generator** (`/admin/automatic-blog?page=social-generator`).

## Purpose

Generate platform-ready Fitdog marketing content that sounds human — smart, funny, not corny — for a professional Santa Monica dog-care business (16 years). Content is downloadable per platform and format. Auto-post queues when platform credentials are connected.

## Photos

- Pulls real photos from **Bulk Photo Upload** first, then licensed web search.
- Captions / scripts are written to match the selected scenes.
- **No AI-generated images** (blocked in policy + selectors).
- CSV/TXT downloads include `imageUrl`, `imageAlt`, `imageCredit`, `imageSourceKind`.

## Platforms & download tables

| Platform | Tables |
|----------|--------|
| Instagram | Feed / profile posts, Stories, Reel captions & scripts |
| Facebook | Page posts, short video scripts |
| TikTok | Captions + on-screen text + spoken script |
| Snapchat | Story snaps, Spotlight-style scripts |

Each table supports **Copy**, **Download CSV** (per format / per platform / all).

## Voice rules

- Partners in members' dogs' care; set people and dogs up for success.
- Want the best for all dog owners; drive traffic to blog/booking without hard sell.
- “Tell your dog we said hi” when it fits.
- Ban AI-slop / corny dog-internet phrases (`lib/blog/social/voice.ts`).

## Connections

Settings cards collect **username / page ID** + **access token / app password**.

- Secrets encrypted at rest (`lib/blog/crypto.ts`).
- Never returned in API responses.
- Test Sync marks `connected` when credentials are present.
- Official Meta / TikTok / Snap APIs require tokens — not browser password scraping.
- Until adapters confirm API success, download remains the production path; queue rows are recorded for Posting Analytics.

## Tables

- `blog_social_connections`
- `blog_social_packs` / `blog_social_pack_items`
- `blog_social_posts` (auto-post queue)

## API

- `GET /api/blog/social` — packs + connections
- `GET /api/blog/social?packId=&download=csv` — CSV export
- `POST /api/blog/social` — `generate` | `save_connection` | `test_connection`
