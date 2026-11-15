/**
 * Graphics from `RuffOps_Team_Engagement_Graphics_Asset_Pack` (extract under public).
 * Paths match the My Shift asset-pack layout for predictable extraction.
 */
const PACK = "/assets/ruffops/team-engagement/RuffOps_Team_Engagement_Graphics_Asset_Pack";

export const PACK_GRAPHICS = {
  pack: PACK,
  reference: `${PACK}/06-reference/team-engagement-dashboard-reference.png`,
  heroTwoDogs: `${PACK}/02-photos/hero-two-dogs.png`,
  decor: {
    hearts: `${PACK}/05-ui-graphics/decor-hearts.png`,
    pawAccent: `${PACK}/05-ui-graphics/paw-accent.png`
  },
  stat: {
    barkOuts: `${PACK}/04-icons/stat-bark-outs.png`,
    participation: `${PACK}/04-icons/stat-participation.png`,
    milestones: `${PACK}/04-icons/stat-milestones.png`,
    activities: `${PACK}/04-icons/stat-activities.png`
  },
  bottom: {
    ideas: `${PACK}/05-ui-graphics/card-share-ideas.png`,
    wellbeing: `${PACK}/05-ui-graphics/card-team-wellbeing.png`,
    pulse: `${PACK}/05-ui-graphics/card-team-pulse.png`,
    strongPack: `${PACK}/05-ui-graphics/card-strong-pack.png`
  },
  icons: {
    barkOuts: "/assets/ruffops/team-engagement/icons/bark-outs.svg",
    milestone: "/assets/ruffops/team-engagement/icons/milestone.svg",
    recognition: "/assets/ruffops/team-engagement/icons/recognition.svg",
    teamOverview: "/assets/ruffops/team-engagement/icons/team-overview.svg",
    chevron: "/assets/ruffops/team-engagement/icons/chevron-right.svg"
  }
} as const;