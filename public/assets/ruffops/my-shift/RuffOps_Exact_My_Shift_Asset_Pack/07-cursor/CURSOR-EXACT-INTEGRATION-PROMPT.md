# RuffOps My Shift — Exact asset integration prompt

Use this asset pack to upgrade the CURRENT RuffOps My Shift implementation. The original supplied mockup is included at `06-reference/my-shift-reference-original.png` and is the visual acceptance target.

## Non-negotiable
- This is an asset-integration and UI implementation task, NOT an image-generation task.
- Do not regenerate the dashboard, create a lookalike screenshot, or use the screenshot as a full-page background.
- Build the screen from real frontend components using the exact supplied crops and graphics.
- Preserve the existing app, routes, data sources, actions, and navigation. Inspect before editing.
- Match the reference's desktop layout, spacing, card proportions, panel ordering, colors, and typography as closely as the current app architecture allows.
- The reference is the authority. Do not invent replacement icons, avatars, dog photos, logos, or decorative artwork when an exact extracted asset is supplied.
- Do not use screenshot sample counts/names/alerts as live data. Bind to existing real data.

## Asset map
- `01-brand/ruffops-wordmark-and-paw.png` — exact logo crop from reference.
- `02-photos/shift-details-hero-dog.png` — exact hero dog image crop.
- `03-avatars/team-*.png` — five exact team portrait crops.
- `04-icons/` — exact screenshot crops for sidebar, KPIs, panels, top bar and quick actions; `*-transparent.png` variants are keyed transparent crops where suitable. Use the original crop if transparency cleanup damages an icon.
- `05-ui-graphics/` — exact panel/background fragments and watermark crop; sparklines are scalable SVG curves.
- `07-cursor/design-tokens.json` — extracted palette and basic geometry.
- `06-reference/my-shift-reference-original.png` — full visual reference.

## Required implementation
1. Inspect current My Shift route/component, existing shell, framework, CSS conventions, icon library, real logo assets, data contracts and action handlers.
2. Upgrade the existing route in place. Do not create a parallel route/demo.
3. Reproduce: left navigation; top utility bar; title/date/on-shift row; five KPI cards; Shift Details + Today's Tasks; Important Alerts + Team on Shift; Quick Actions + Recent Activity.
4. Use exact extracted images/icons from this pack for the corresponding visual elements. If the project already has a higher-quality official logo asset, use that official asset rather than the screenshot crop.
5. Keep all current interactions working. Wire to existing routes/actions; do not fabricate endpoints or claim fake success.
6. Responsive behavior: match the 1536px desktop reference first; tablet becomes a clear stacked grid; mobile keeps tasks and quick actions usable with navigation collapsed appropriately.
7. Accessibility: semantic controls, visible focus, keyboard support, contrast, alt text, reduced motion.
8. Run existing lint/build/tests. Report changed files, what was wired to real data, and any unavailable integrations.

## Acceptance test
At 1536×1024, compare a browser screenshot against the included reference. The resulting screen must be recognizably the same composition—not merely the same color scheme. No missing card, no reordered sections, no generic substitute artwork, no fake data, no nonfunctional buttons.
