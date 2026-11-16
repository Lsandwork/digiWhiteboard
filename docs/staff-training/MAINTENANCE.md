# Staff Training Center — maintenance

## Where content lives

| Piece | Location |
| --- | --- |
| Course & lesson definitions | `lib/staff-training/catalog.ts` |
| Voiceover scripts (spoken text) | `lib/staff-training/scripts/front-desk.ts`, `overnight.ts` |
| Progress API | `app/api/admin/staff-training/route.ts` |
| UI | `components/admin/staff-training/StaffTrainingPanel.tsx` |
| DB migration | `supabase/migrations/104_staff_training.sql` |

## Adding a screen recording

1. Record on a **sanitized training account** at 1920×1080 (no real customer PII).
2. Export H.264 MP4; optional WebVTT captions matching the script verbatim.
3. Place files under `public/training/<course>/<lesson>.mp4` and `.vtt`.
4. Set `videoSrc`, `captionsVtt`, `videoStatus: "ready"` on the lesson in `catalog.ts`.

## Human narration

- Official scripts live in `lib/staff-training/scripts/*`.
- Generate or refresh muxed lesson video: `npx tsx scripts/staff-training-build-voiceover.ts` (reads scripts, writes `*.narration.m4a`, muxes into `*.mp4`). Screen-only masters are kept as `*.screen-only.mp4`.
- To swap in a trainer’s studio take: replace `public/training/<course>/<lesson>.narration.m4a` and re-run the script above.
- Catalog sets `narrationStatus: "recorded"` when build output is committed.

## When RuffOps UI changes

1. Re-record or re-cut the affected lesson.
2. Update guided steps and quiz questions in `catalog.ts`.
3. Bump `verificationNotes` if a tab is renamed or gated.

## Management reports

Managers with `view_staff_training_reports` open **Staff Training** and load Front Desk or Overnight reports. Data requires migration `104` applied in Supabase.