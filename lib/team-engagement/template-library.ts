import { randomUUID } from "crypto";
import { ENGAGEMENT_TEMPLATE_CATALOG } from "@/lib/team-engagement/template-catalog.generated";
import { assertCommunityText } from "@/lib/team-engagement/community-content";
import { forbiddenError, validationError } from "@/lib/team-engagement/errors";
import { createAnnouncement } from "@/lib/team-engagement/records";
import { saveFunPoll, saveFunQuestion } from "@/lib/team-engagement/pack-features";
import { savePackGoal } from "@/lib/team-engagement/pack-goals";
import { assertEngagementWriteReady, multilineText, nowIso, requireStorage, text, type ServiceContext } from "@/lib/team-engagement/context";
import {
  applyTemplateFields,
  assertTemplateResolvable,
  assertTemplateToneAllowed,
  type TemplateFieldMap
} from "@/lib/team-engagement/template-personalization";
import {
  ENGAGEMENT_TEMPLATE_TABS,
  type EngagementTemplateKind,
  type EngagementTemplateRow,
  type EngagementTemplateTab,
  type EngagementTemplateSeed
} from "@/lib/team-engagement/template-types";
import { TEMPLATE_LIBRARY_MIGRATION } from "@/lib/team-engagement/constants";

type TemplateDbRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tab: string;
  category: string;
  tone: string;
  title_template: string;
  message_template: string;
  instructions_template: string | null;
  kind: string;
  placeholder_fields: string[];
  default_payload: Record<string, unknown>;
  status: "draft" | "active" | "archived";
  is_system: boolean;
  source_slug: string | null;
  usage_count: number;
  last_used_at: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  updated_by_user_id: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

const TAB_LABELS: Record<EngagementTemplateTab, string> = {
  the_pack: "The Pack",
  bark_outs: "Bark Outs",
  milestones: "Milestones & Celebrations",
  pack_goals: "Pack Goals",
  fun_zone: "Fun Zone",
  employee_voice: "Employee Voice",
  team_pulse: "Team Pulse",
  ideas: "Ideas for the Pack",
  campaigns: "Campaigns",
  management_comms: "Management Communications"
};

function slugId(slug: string): string {
  return `catalog-${slug}`;
}

function mapCatalogItem(seed: EngagementTemplateSeed, favorited = false): EngagementTemplateRow {
  const now = new Date().toISOString();
  return {
  ...seed,
    id: slugId(seed.slug),
    status: "active",
    isSystem: seed.isSystem ?? true,
    sourceSlug: seed.slug,
    placeholderFields: seed.placeholderFields ?? [],
    usageCount: 0,
    lastUsedAt: null,
    createdByUserId: null,
    createdByName: "RuffOps Template Library",
    updatedByUserId: null,
    updatedByName: null,
    createdAt: now,
    updatedAt: now,
    favorited
  };
}

function mapDbRow(row: TemplateDbRow, favorited: boolean): EngagementTemplateRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    tab: row.tab as EngagementTemplateTab,
    category: row.category,
    tone: row.tone,
    titleTemplate: row.title_template,
    messageTemplate: row.message_template,
    instructionsTemplate: row.instructions_template,
    kind: row.kind as EngagementTemplateKind,
    placeholderFields: row.placeholder_fields ?? [],
    payload: row.default_payload ?? {},
    status: row.status,
    isSystem: row.is_system,
    sourceSlug: row.source_slug,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    updatedByUserId: row.updated_by_user_id,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorited
  };
}

async function templatesReady(ctx: ServiceContext): Promise<boolean> {
  const status = await ctx.db.tableStatus().catch(() => null);
  return status?.team_engagement_templates === true;
}

async function loadFavoriteIds(ctx: ServiceContext): Promise<Set<string>> {
  const { rows } = await ctx.db.select<{ template_id: string }>("team_engagement_template_favorites", {
    filters: [{ column: "user_id", op: "eq", value: ctx.actor.userId }],
    limit: 5000
  });
  return new Set(rows.map((row) => row.template_id));
}

export async function syncTemplateCatalog(ctx: ServiceContext): Promise<number> {
  if (!(await templatesReady(ctx))) return 0;
  const now = nowIso(ctx);
  const { rows: existing } = await ctx.db.select<{ slug: string }>("team_engagement_templates", {
    filters: [{ column: "is_system", op: "eq", value: true }],
    limit: 5000
  });
  const have = new Set(existing.map((row) => row.slug));
  const missing = ENGAGEMENT_TEMPLATE_CATALOG.filter((seed) => !have.has(seed.slug));
  if (!missing.length) return 0;
  await ctx.db.commit(
    missing.map((seed) => ({
      op: "insert" as const,
      table: "team_engagement_templates" as const,
      values: {
        id: randomUUID(),
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        tab: seed.tab,
        category: seed.category,
        tone: seed.tone,
        title_template: seed.titleTemplate,
        message_template: seed.messageTemplate,
        instructions_template: seed.instructionsTemplate ?? null,
        kind: seed.kind,
        placeholder_fields: seed.placeholderFields ?? [],
        default_payload: seed.payload ?? {},
        status: "active",
        is_system: true,
        source_slug: seed.slug,
        usage_count: 0,
        last_used_at: null,
        created_by_user_id: null,
        created_by_name: "RuffOps Template Library",
        updated_by_user_id: null,
        updated_by_name: "RuffOps Template Library",
        created_at: now,
        updated_at: now
      }
    }))
  );
  return missing.length;
}

export async function templateLibraryView(
  ctx: ServiceContext,
  params: { tab?: string; q?: string; includeArchived?: string; favoritesOnly?: string }
) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();

  const tab = params.tab && (ENGAGEMENT_TEMPLATE_TABS as readonly string[]).includes(params.tab) ? (params.tab as EngagementTemplateTab) : null;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const includeArchived = params.includeArchived === "1";
  const favoritesOnly = params.favoritesOnly === "1";

  const ready = await templatesReady(ctx);
  if (!ready) {
    let items = ENGAGEMENT_TEMPLATE_CATALOG.map((seed) => mapCatalogItem(seed));
    if (tab) items = items.filter((item) => item.tab === tab);
    if (!includeArchived) items = items.filter((item) => item.status !== "archived");
    if (q) {
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.messageTemplate.toLowerCase().includes(q)
      );
    }
    return {
      ready: false as const,
      migration: TEMPLATE_LIBRARY_MIGRATION,
      catalogOnly: true,
      tabs: ENGAGEMENT_TEMPLATE_TABS.map((id) => ({ id, label: TAB_LABELS[id] })),
      tones: ["Warm & Appreciative", "Professional", "Celebratory", "Motivational", "Lighthearted", "Thoughtful", "Encouraging", "Constructive"],
      total: items.length,
      items
    };
  }

  await syncTemplateCatalog(ctx);
  const favorites = await loadFavoriteIds(ctx);
  const filters = [];
  if (tab) filters.push({ column: "tab", op: "eq" as const, value: tab });
  if (!includeArchived) filters.push({ column: "status", op: "neq" as const, value: "archived" });
  const { rows } = await ctx.db.select<TemplateDbRow>("team_engagement_templates", {
    filters,
    order: [{ column: "tab", ascending: true }, { column: "category", ascending: true }, { column: "name", ascending: true }],
    limit: 5000
  });
  let items = rows.map((row) => mapDbRow(row, favorites.has(row.id)));
  if (favoritesOnly) items = items.filter((item) => item.favorited);
  if (q) {
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.messageTemplate.toLowerCase().includes(q)
    );
  }

  const { rows: recentPubs } = await ctx.db.select<{ template_slug: string; created_at: string }>(
    "team_engagement_template_publications",
    { order: [{ column: "created_at", ascending: false }], limit: 500 }
  );
  const usageBySlug = new Map<string, number>();
  for (const pub of recentPubs) usageBySlug.set(pub.template_slug, (usageBySlug.get(pub.template_slug) ?? 0) + 1);

  return {
    ready: true as const,
    migration: TEMPLATE_LIBRARY_MIGRATION,
    catalogOnly: false,
    tabs: ENGAGEMENT_TEMPLATE_TABS.map((id) => ({ id, label: TAB_LABELS[id] })),
    tones: ["Warm & Appreciative", "Professional", "Celebratory", "Motivational", "Lighthearted", "Thoughtful", "Encouraging", "Constructive"],
    total: items.length,
    items: items.map((item) => ({
      ...item,
      recentUsage: usageBySlug.get(item.slug) ?? 0
    }))
  };
}

function parseFields(input: unknown): TemplateFieldMap {
  if (!input || typeof input !== "object") return {};
  const fields: TemplateFieldMap = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) {
      fields[key as keyof TemplateFieldMap] = value.trim();
    }
  }
  return fields;
}

async function getTemplateById(ctx: ServiceContext, id: string): Promise<EngagementTemplateRow | null> {
  if (id.startsWith("catalog-")) {
    const slug = id.replace(/^catalog-/, "");
    const seed = ENGAGEMENT_TEMPLATE_CATALOG.find((entry) => entry.slug === slug);
    return seed ? mapCatalogItem(seed) : null;
  }
  const { rows } = await ctx.db.select<TemplateDbRow>("team_engagement_templates", {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1
  });
  if (!rows[0]) return null;
  const favorites = await loadFavoriteIds(ctx);
  return mapDbRow(rows[0], favorites.has(rows[0].id));
}

export async function saveEngagementTemplate(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  if (!(await templatesReady(ctx))) throw validationError("Apply the template library migration before saving custom templates.");

  const base = input.templateId ? await getTemplateById(ctx, String(input.templateId)) : null;
  const name = text(input.name ?? base?.name, 160);
  const description = multilineText(input.description ?? base?.description, 600);
  const titleTemplate = text(input.title ?? input.titleTemplate ?? base?.titleTemplate, 200);
  const messageTemplate = multilineText(input.message ?? input.messageTemplate ?? base?.messageTemplate, 8000);
  const instructionsTemplate = input.instructions ? multilineText(input.instructions, 2000) : base?.instructionsTemplate ?? null;
  const tone = text(input.tone ?? base?.tone ?? "Professional", 64);
  assertTemplateToneAllowed(tone);
  assertCommunityText(titleTemplate, "voice");
  assertCommunityText(messageTemplate, "voice");

  const tab = oneOfTab(input.tab ?? base?.tab);
  const category = text(input.category ?? base?.category ?? "custom", 80);
  const kind = (typeof input.kind === "string" ? input.kind : base?.kind) as EngagementTemplateKind;
  const now = nowIso(ctx);
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const slug =
    typeof input.slug === "string" && input.slug.trim()
      ? input.slug.trim()
      : `custom-${ctx.actor.userId?.slice(0, 8) ?? "mgmt"}-${id.slice(0, 8)}`;

  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_templates",
      conflict: ["id"],
      values: {
        id,
        slug,
        name: name.length >= 2 ? name : "Custom Template",
        description,
        tab,
        category,
        tone,
        title_template: titleTemplate,
        message_template: messageTemplate,
        instructions_template: instructionsTemplate,
        kind,
        placeholder_fields: base?.placeholderFields ?? [],
        default_payload: base?.payload ?? {},
        status: input.status === "draft" ? "draft" : "active",
        is_system: false,
        source_slug: base?.sourceSlug ?? base?.slug ?? null,
        usage_count: 0,
        last_used_at: null,
        created_by_user_id: ctx.actor.userId,
        created_by_name: ctx.actor.name,
        updated_by_user_id: ctx.actor.userId,
        updated_by_name: ctx.actor.name,
        created_at: now,
        updated_at: now
      }
    }
  ]);

  const saved = await getTemplateById(ctx, id);
  return { item: saved };
}

function oneOfTab(value: unknown): EngagementTemplateTab {
  if (typeof value === "string" && (ENGAGEMENT_TEMPLATE_TABS as readonly string[]).includes(value)) {
    return value as EngagementTemplateTab;
  }
  return "the_pack";
}

export async function duplicateEngagementTemplate(ctx: ServiceContext, input: { templateId?: unknown }) {
  const source = input.templateId ? await getTemplateById(ctx, String(input.templateId)) : null;
  if (!source) throw validationError("Choose a template to duplicate.");
  return saveEngagementTemplate(ctx, {
    name: `${source.name} (Copy)`,
    description: source.description,
    title: source.titleTemplate,
    message: source.messageTemplate,
    instructions: source.instructionsTemplate,
    tab: source.tab,
    category: source.category,
    kind: source.kind,
    tone: source.tone,
    templateId: source.id
  });
}

export async function favoriteEngagementTemplate(ctx: ServiceContext, input: { templateId?: unknown; favorite?: unknown }) {
  requireStorage(ctx);
  if (!(await templatesReady(ctx))) return { favorited: false };
  const templateId = typeof input.templateId === "string" ? input.templateId : "";
  if (!templateId || templateId.startsWith("catalog-")) return { favorited: input.favorite === true };
  if (input.favorite === true) {
    await ctx.db.commit([
      {
        op: "upsert",
        table: "team_engagement_template_favorites",
        conflict: ["template_id", "user_id"],
        values: { template_id: templateId, user_id: ctx.actor.userId, created_at: nowIso(ctx) }
      }
    ]);
    return { favorited: true };
  }
  await ctx.db.commit([
    {
      op: "delete",
      table: "team_engagement_template_favorites",
      match: { template_id: templateId, user_id: ctx.actor.userId }
    }
  ]);
  return { favorited: false };
}

export async function archiveEngagementTemplate(ctx: ServiceContext, input: { templateId?: unknown }) {
  requireStorage(ctx);
  if (!(await templatesReady(ctx))) throw validationError("Template storage is not ready.");
  const templateId = typeof input.templateId === "string" ? input.templateId : "";
  if (!templateId || templateId.startsWith("catalog-")) throw validationError("System catalog templates stay available; duplicate one to customize or archive a copy.");
  const { rows } = await ctx.db.select<TemplateDbRow>("team_engagement_templates", {
    filters: [{ column: "id", op: "eq", value: templateId }],
    limit: 1
  });
  const row = rows[0];
  if (!row) throw validationError("Template not found.");
  if (row.is_system && ctx.actor.tier !== "super_admin") throw forbiddenError();
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_templates",
      match: { id: templateId },
      set: {
        status: "archived",
        updated_at: nowIso(ctx),
        updated_by_user_id: ctx.actor.userId,
        updated_by_name: ctx.actor.name
      }
    }
  ]);
  return { archived: true };
}

export async function publishEngagementTemplate(ctx: ServiceContext, input: Record<string, unknown>) {
  if (!ctx.actor.tier) throw forbiddenError();
  const template = input.templateId ? await getTemplateById(ctx, String(input.templateId)) : null;
  if (!template) throw validationError("Choose a template to publish.");
  await assertEngagementWriteReady(ctx, template.kind);

  const fields = parseFields(input.fields);
  const asDraft = input.publishMode === "draft" || input.asDraft === true;
  const title = applyTemplateFields(text(input.title ?? template.titleTemplate, 200), fields);
  const message = applyTemplateFields(multilineText(input.message ?? template.messageTemplate, 8000), fields);
  const instructions = template.instructionsTemplate
    ? applyTemplateFields(multilineText(input.instructions ?? template.instructionsTemplate, 2000), fields)
    : null;
  assertTemplateResolvable(title, message, instructions, asDraft);
  assertCommunityText(title, template.kind === "bark_out" ? "bark_out" : "voice");
  assertCommunityText(message, template.kind === "bark_out" ? "bark_out" : "voice");
  if (instructions) assertCommunityText(instructions, "voice");

  const audienceDepartments = Array.isArray(input.audienceDepartments)
    ? input.audienceDepartments.filter((value): value is string => typeof value === "string")
    : [];

  const scheduledFor = typeof input.scheduledFor === "string" ? input.scheduledFor : null;
  const expiresAt = typeof input.expiresAt === "string" ? input.expiresAt : null;
  const now = nowIso(ctx);
  const publicationId = randomUUID();

  let target: Record<string, unknown> | null = null;

  if (!asDraft) {
    switch (template.kind) {
      case "announcement":
      case "culture_message":
      case "campaign":
        target = await createAnnouncement(ctx, { title, body: message, audienceDepartments });
        break;
      case "poll": {
        const options = Array.isArray(template.payload?.options) ? template.payload?.options : [];
        target = await saveFunPoll(ctx, { prompt: message, options });
        break;
      }
      case "question_week":
      case "fun_activity":
        target = await saveFunQuestion(ctx, { prompt: message });
        break;
      case "goal":
        target = await savePackGoal(ctx, {
          title,
          description: message,
          goalType: template.payload?.goalType ?? "teamwork",
          targetValue: template.payload?.targetValue,
          successCriteria: template.payload?.measurementMethod
        });
        break;
      case "bark_out":
        target = {
          prefilled: true,
          category: template.payload?.category ?? "Teamwork",
          title,
          message,
          management: template.payload?.management === true
        };
        break;
      case "idea_prompt":
        target = {
          prefilled: true,
          subject: title,
          prompt: message,
          category: template.payload?.ideaCategory ?? "other"
        };
        break;
      default:
        target = { recorded: true, kind: template.kind };
    }
  }

  if (await templatesReady(ctx)) {
    await ctx.db.commit([
      {
        op: "insert",
        table: "team_engagement_template_publications",
        values: {
          id: publicationId,
          template_id: template.id.startsWith("catalog-") ? null : template.id,
          template_slug: template.slug,
          tab: template.tab,
          kind: template.kind,
          title_snapshot: title,
          message_snapshot: message,
          instructions_snapshot: instructions,
          audience_departments: audienceDepartments,
          status: asDraft ? "draft" : scheduledFor ? "scheduled" : "published",
          scheduled_for: scheduledFor,
          expires_at: expiresAt,
          target_type: target && typeof target === "object" && "id" in target ? String((target as { id?: string }).id ? template.kind : "") : null,
          target_id: target && typeof target === "object" && "id" in target ? String((target as { id: string }).id) : null,
          participation_summary: {},
          published_by_user_id: ctx.actor.userId,
          published_by_name: ctx.actor.name,
          created_at: now,
          updated_at: now
        }
      },
      ...(template.id.startsWith("catalog-")
        ? []
        : [
            {
              op: "update" as const,
              table: "team_engagement_templates" as const,
              match: { id: template.id },
              set: {
                usage_count: template.usageCount + 1,
                last_used_at: now,
                updated_at: now,
                updated_by_user_id: ctx.actor.userId,
                updated_by_name: ctx.actor.name
              }
            }
          ])
    ]);
  }

  return {
    publicationId,
    preview: { title, message, instructions },
    draft: asDraft,
    result: target
  };
}