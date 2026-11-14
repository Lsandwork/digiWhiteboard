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

## Human narration (required for official release)

- Record in a quiet room; match the script in `lib/staff-training/scripts/*`.
- Replace video audio in post (do **not** use AI TTS for official Fitdog training).
- Set `narrationStatus: "recorded"` on the lesson when mastered audio is muxed.

## When RuffOps UI changes

1. Re-record or re-cut the affected lesson.
2. Update guided steps and quiz questions in `catalog.ts`.
3. Bump `verificationNotes` if a tab is renamed or gated.

## Management reports

Managers with `view_staff_training_reports` open **Staff Training** and load Front Desk or Overnight reports. Data requires migration `104` applied in Supabase.