# Blog Dashboard visual regression notes

## Source of truth
Approved mockup provided for this rebuild (desktop SaaS Blog Generator dashboard).
The uploaded file path ` /mnt/data/image(20260806-014241).png ` was not available in the cloud agent filesystem; layout was implemented from the attached high-fidelity mockup description and Fitdog brand tokens already in-repo.

## Route
`/admin/automatic-blog` (page=`overview` by default)

## Capture checklist (1536 × 1024)
1. Sign in as Super Admin / Admin / Marketing.
2. Open `/admin/automatic-blog`.
3. Confirm:
   - Dark sidebar (~220px) with Fitdog circle badge + wordmark
   - Orange active Dashboard item
   - Sticky white top bar with search, notifications, user chip
   - Five KPI cards + orange New Article split button
   - Performance / Top Articles / Calendar row
   - Content Pipeline five columns
   - Activity / promo / AI assistant / category donut
4. Compare against the approved mockup; adjust spacing tokens in `app/admin/automatic-blog/blog-dashboard.css` if needed.

## Honest unavailable states (expected differences vs mockup sample numbers)
Mockup sample values (48, 24.7K, 4.3%, etc.) must **not** appear unless produced by real analytics.
Until pageview analytics are connected, Views / Engagement / Avg Read Time show “not connected / unavailable”.

## Automated coverage
`npm run test:blog` includes `scripts/test-blog-dashboard.ts` for nav IA + workflow transition rules.
