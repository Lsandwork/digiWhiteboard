# RuffOps Team Engagement — Graphics Asset Pack

Extract the user-supplied `RuffOps_Team_Engagement_Graphics_Asset_Pack.zip` into this folder so paths align with `lib/team-engagement/pack-assets.ts`.

Expected contents (from the reference dashboard):

- `02-photos/` — hero two-dog artwork, avatar crops
- `04-icons/` — stat icons, tab icons
- `05-ui-graphics/` — decorative hearts, bottom engagement card art
- `06-reference/` — `team-engagement-dashboard-reference.png`
- `07-cursor/design-tokens.json` — palette (shipped in repo; update if the pack includes a newer file)
- `manifest.json` — asset index from the ZIP

Do not use the full reference PNG as a page background. Build live React components and load individual assets by path.