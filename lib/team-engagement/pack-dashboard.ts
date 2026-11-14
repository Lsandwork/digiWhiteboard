import { BARK_OUT_REACTIONS } from "@/lib/team-engagement/constants";
import { employeeFeed, myBarkOuts } from "@/lib/team-engagement/bark-outs";
import { announcementsForEmployee } from "@/lib/team-engagement/records";
import type { BarkOutView } from "@/lib/team-engagement/bark-outs";
import type { ServiceContext } from "@/lib/team-engagement/context";
import { commentCounts, milestonesView, packTablesReady, resolvePackSpotlight, funZoneView } from "@/lib/team-engagement/pack-features";
import type { DbFilter } from "@/lib/team-engagement/types";
import { PACK_PRIORITY2_MIGRATION } from "@/lib/team-engagement/constants";

function pacificGreeting(now: Date): string {
  const hour = Number(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false })
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function monthStartIso(ctx: ServiceContext): string {
  const now = new Date(ctx.now());
  const pacific = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const base = new Date(pacific);
  const y = base.getFullYear();
  const m = base.getMonth();
  return new Date(Date.UTC(y, m, 1, 8, 0, 0)).toISOString();
}

function daysAgoIso(ctx: ServiceContext, days: number): string {
  return new Date(new Date(ctx.now()).getTime() - days * 86_400_000).toISOString();
}

function reactionTotal(item: BarkOutView): number {
  return BARK_OUT_REACTIONS.reduce((sum, key) => sum + (item.reactions[key] ?? 0), 0);
}

async function countPublished(ctx: ServiceContext, extra: DbFilter[] = []) {
  const { total } = await ctx.db.select("team_engagement_bark_outs", {
    filters: [{ column: "status", op: "eq", value: "published" }, ...extra],
    limit: 1,
    count: true
  });
  return total ?? 0;
}

async function distinctAuthorsSince(ctx: ServiceContext, since: string): Promise<number> {
  const { rows } = await ctx.db.select<{ author_user_id: string }>("team_engagement_bark_outs", {
    filters: [
      { column: "status", op: "eq", value: "published" },
      { column: "published_at", op: "gte", value: since }
    ],
    limit: 500
  });
  const ids = new Set(rows.map((row) => row.author_user_id).filter(Boolean));
  return ids.size;
}

/** Staff landing dashboard for The Pack — real counts only, no fabricated posts. */
export async function packDashboard(ctx: ServiceContext) {
  const settings = await ctx.settings();
  if (!ctx.storageReady) {
    return { storageReady: false as const, features: settings.features };
  }

  const directory = await ctx.directory();
  const monthStart = monthStartIso(ctx);
  const weekStart = daysAgoIso(ctx, 7);

  const [feed, mine, announcements, monthCount, weekCount, authorsThisMonth, pendingForMe] = await Promise.all([
    employeeFeed(ctx, { offset: 0 }),
    myBarkOuts(ctx),
    announcementsForEmployee(ctx),
    countPublished(ctx, [{ column: "published_at", op: "gte", value: monthStart }]),
    countPublished(ctx, [{ column: "published_at", op: "gte", value: weekStart }]),
    distinctAuthorsSince(ctx, monthStart),
    countPublished(ctx, [
      { column: "recipient_user_id", op: "eq", value: ctx.actor.userId },
      { column: "published_at", op: "gte", value: weekStart }
    ])
  ]);

  const activeEmployees = directory.employees.filter((employee) => employee.active).length;
  const participationPercent =
    activeEmployees > 0 ? Math.min(100, Math.round((authorsThisMonth / activeEmployees) * 100)) : 0;

  let autoSpotlight: BarkOutView | null = null;
  const weekItems = feed.items.filter((item) => item.publishedAt && item.publishedAt >= weekStart);
  for (const item of weekItems.length ? weekItems : feed.items) {
    if (!autoSpotlight || reactionTotal(item) > reactionTotal(autoSpotlight)) autoSpotlight = item;
  }
  const resolvedSpotlight = await resolvePackSpotlight(ctx, autoSpotlight);
  const commentMap = await commentCounts(
    ctx,
    feed.items.map((item) => item.id)
  );
  const activityFeed = feed.items.slice(0, 12).map((item) => ({
    ...item,
    commentCount: commentMap.get(item.id) ?? 0
  }));

  const [milestones, funZone, packReady] = await Promise.all([milestonesView(ctx), funZoneView(ctx), packTablesReady(ctx)]);

  const awaiting = mine.sent.filter((row) => row.status === "awaiting_confirmation" || row.status === "pending_review");

  return {
    storageReady: true as const,
    features: settings.features,
    greeting: pacificGreeting(new Date(ctx.now())),
    me: {
      userId: ctx.actor.userId,
      name: ctx.actor.name,
      canPost: ctx.actor.permissions.includes("engagement.create_bark_out") && !ctx.actor.impersonated
    },
    tagline: "Good things happen when we work together.",
    stats: {
      barkOutsThisMonth: monthCount,
      barkOutsThisWeek: weekCount,
      participationPercent,
      teamSize: activeEmployees,
      newForMeThisWeek: pendingForMe,
      pendingMyPosts: awaiting.length
    },
    activityFeed,
    spotlight: resolvedSpotlight.barkOut,
    spotlightMeta: resolvedSpotlight.curated,
    milestonesPreview: milestones,
    funZonePreview: funZone,
    packMigration: PACK_PRIORITY2_MIGRATION,
    packStorageReady: Object.values(packReady).every(Boolean),
    personal: {
      receivedCount: mine.received.length,
      sentCount: mine.sent.length,
      awaitingConfirmation: awaiting.map((row) => ({
        id: row.id,
        recipientName: row.recipient.name,
        statusLabel: row.statusLabel
      }))
    },
    announcements: announcements.items.slice(0, 5),
    sectionStatus: {
      milestones: milestones.ready
        ? { ready: true }
        : { ready: false, message: `Apply ${PACK_PRIORITY2_MIGRATION} and sync milestones from staff hire dates.` },
      packGoals: { ready: false, message: "Pack Goals are coming soon. Leaders will post team challenges here." },
      funZone: funZone.ready
        ? { ready: true }
        : { ready: false, message: `Fun Zone opens after ${PACK_PRIORITY2_MIGRATION} is applied.` },
      employeeVoice: { ready: settings.features.feedback, message: settings.features.feedback ? "Use Ideas for the Pack or leadership surveys when they are published." : "Surveys are not enabled yet." },
      ideas: { ready: settings.features.feedback }
    }
  };
}