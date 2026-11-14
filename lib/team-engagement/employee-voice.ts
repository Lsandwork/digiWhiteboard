import { createHash, randomUUID } from "node:crypto";
import {
  ENGAGEMENT_DEPARTMENTS,
  VOICE_QUESTION_TYPES,
  VOICE_SURVEY_STATUSES,
  type VoiceQuestionType,
  type VoiceSurveyStatus
} from "@/lib/team-engagement/constants";
import { multilineText, nowIso, oneOf, optionalText, requireStorage, requireUuid, text, type ServiceContext } from "@/lib/team-engagement/context";
import { EngagementError, forbiddenError, notFoundError, validationError } from "@/lib/team-engagement/errors";
import { scopeIncludesDepartments } from "@/lib/team-engagement/permissions";
import type { DbOp } from "@/lib/team-engagement/types";

type SurveyRow = {
  id: string;
  title: string;
  introduction: string | null;
  anonymity_mode: "identified" | "anonymous";
  status: string;
  departments: string[];
  publish_at: string | null;
  close_at: string | null;
  min_aggregate_responses: number;
};

type QuestionRow = {
  id: string;
  survey_id: string;
  prompt: string;
  question_type: string;
  options: unknown;
  required: boolean;
  sort_order: number;
};

function participantHash(userId: string, surveyId: string) {
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "development-only-pepper";
  return createHash("sha256").update(`team_engagement_voice:${pepper}:${userId}:${surveyId}`).digest("hex");
}

async function assertVoiceTables(ctx: ServiceContext) {
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status?.team_engagement_voice_surveys) {
    throw new EngagementError(503, "setup_required", "Employee Voice requires migration 107.");
  }
}

function surveyOpen(row: SurveyRow, now: string) {
  if (row.status !== "active") return false;
  if (row.publish_at && row.publish_at > now) return false;
  if (row.close_at && row.close_at < now) return false;
  return true;
}

function employeeEligible(ctx: ServiceContext, row: SurveyRow) {
  if (!row.departments.length) return true;
  return scopeIncludesDepartments(ctx.actor.scope, row.departments) || row.departments.some((d) => (ctx.actor.departments as string[]).includes(d));
}

export async function employeeVoiceCatalog(ctx: ServiceContext) {
  requireStorage(ctx);
  const status = await ctx.db.tableStatus().catch(() => null);
  if (!status?.team_engagement_voice_surveys) {
    return { ready: false as const, items: [] };
  }
  const now = nowIso(ctx);
  const { rows } = await ctx.db.select<SurveyRow>("team_engagement_voice_surveys", {
    filters: [{ column: "status", op: "eq", value: "active" }],
    limit: 20
  });
  const open = rows.filter((row) => surveyOpen(row, now) && employeeEligible(ctx, row));
  const items = await Promise.all(
    open.map(async (survey) => {
      const { rows: questions } = await ctx.db.select<QuestionRow>("team_engagement_voice_questions", {
        filters: [{ column: "survey_id", op: "eq", value: survey.id }],
        order: [{ column: "sort_order", ascending: true }],
        limit: 50
      });
      let completed = false;
      if (survey.anonymity_mode === "anonymous") {
        const hash = participantHash(ctx.actor.userId, survey.id);
        const { rows: done } = await ctx.db.select("team_engagement_voice_anonymous_completions", {
          filters: [
            { column: "survey_id", op: "eq", value: survey.id },
            { column: "participant_hash", op: "eq", value: hash }
          ],
          limit: 1
        });
        completed = done.length > 0;
      } else {
        const { rows: done } = await ctx.db.select("team_engagement_voice_responses", {
          filters: [
            { column: "survey_id", op: "eq", value: survey.id },
            { column: "responder_user_id", op: "eq", value: ctx.actor.userId }
          ],
          limit: 1
        });
        completed = done.length > 0;
      }
      return {
        id: survey.id,
        title: survey.title,
        introduction: survey.introduction,
        anonymityMode: survey.anonymity_mode,
        completed,
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          questionType: q.question_type,
          options: Array.isArray(q.options) ? q.options : [],
          required: q.required
        }))
      };
    })
  );
  return { ready: true as const, items };
}

function parseAnswer(question: QuestionRow, raw: unknown) {
  switch (question.question_type as VoiceQuestionType) {
    case "yes_no":
      return raw === true || raw === "yes" ? "yes" : raw === false || raw === "no" ? "no" : null;
    case "rating": {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
    }
    case "single":
    case "multi":
      return raw;
    case "text":
      return typeof raw === "string" ? multilineText(raw, 2000) : null;
    default:
      return null;
  }
}

export async function submitVoiceSurvey(ctx: ServiceContext, input: { surveyId?: unknown; answers?: unknown }) {
  requireStorage(ctx);
  await assertVoiceTables(ctx);
  const surveyId = requireUuid(input.surveyId, "surveyId");
  const answers = input.answers && typeof input.answers === "object" ? (input.answers as Record<string, unknown>) : {};
  const { rows } = await ctx.db.select<SurveyRow>("team_engagement_voice_surveys", {
    filters: [{ column: "id", op: "eq", value: surveyId }],
    limit: 1
  });
  const survey = rows[0];
  if (!survey) throw notFoundError("Survey");
  const now = nowIso(ctx);
  if (!surveyOpen(survey, now)) throw validationError("This survey is not open.");
  if (!employeeEligible(ctx, survey)) throw forbiddenError();

  const { rows: questions } = await ctx.db.select<QuestionRow>("team_engagement_voice_questions", {
    filters: [{ column: "survey_id", op: "eq", value: surveyId }],
    limit: 50
  });
  if (!questions.length) throw validationError("This survey has no questions yet.");

  const ops: DbOp[] = [];
  if (survey.anonymity_mode === "anonymous") {
    const hash = participantHash(ctx.actor.userId, surveyId);
    const { rows: done } = await ctx.db.select("team_engagement_voice_anonymous_completions", {
      filters: [
        { column: "survey_id", op: "eq", value: surveyId },
        { column: "participant_hash", op: "eq", value: hash }
      ],
      limit: 1
    });
    if (done.length) throw new EngagementError(409, "duplicate", "You already completed this survey.");
    for (const question of questions) {
      const parsed = parseAnswer(question, answers[question.id]);
      if (question.required && (parsed === null || parsed === "")) throw validationError(`Answer “${question.prompt}”.`);
      ops.push({
        op: "insert",
        table: "team_engagement_voice_anonymous_responses",
        values: {
          id: randomUUID(),
          survey_id: surveyId,
          question_id: question.id,
          answer: parsed ?? "",
          created_at: now
        }
      });
    }
    ops.push({
      op: "insert",
      table: "team_engagement_voice_anonymous_completions",
      values: { survey_id: surveyId, participant_hash: hash, completed_at: now }
    });
  } else {
    const { rows: existing } = await ctx.db.select("team_engagement_voice_responses", {
      filters: [
        { column: "survey_id", op: "eq", value: surveyId },
        { column: "responder_user_id", op: "eq", value: ctx.actor.userId }
      ],
      limit: 1
    });
    if (existing.length) throw new EngagementError(409, "duplicate", "You already completed this survey.");
    for (const question of questions) {
      const parsed = parseAnswer(question, answers[question.id]);
      if (question.required && (parsed === null || parsed === "")) throw validationError(`Answer “${question.prompt}”.`);
      ops.push({
        op: "insert",
        table: "team_engagement_voice_responses",
        values: {
          id: randomUUID(),
          survey_id: surveyId,
          question_id: question.id,
          responder_user_id: ctx.actor.userId,
          responder_name: ctx.actor.name,
          answer: parsed ?? "",
          created_at: now
        }
      });
    }
  }
  await ctx.db.commit(ops);
  return { surveyId, completed: true };
}

export async function listVoiceSurveysLeadership(ctx: ServiceContext) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertVoiceTables(ctx);
  const { rows } = await ctx.db.select<SurveyRow>("team_engagement_voice_surveys", {
    order: [{ column: "updated_at", ascending: false }],
    limit: 50
  });
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      anonymityMode: row.anonymity_mode,
      publishAt: row.publish_at,
      closeAt: row.close_at,
      departments: row.departments
    }))
  };
}

export async function saveVoiceSurvey(ctx: ServiceContext, input: Record<string, unknown>) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  await assertVoiceTables(ctx);
  const title = text(input.title, 160);
  if (title.length < 3) throw validationError("Survey title is required.");
  const introduction = optionalText(input.introduction, 1201);
  const anonymityMode = input.anonymityMode === "anonymous" ? "anonymous" : "identified";
  const departments = Array.isArray(input.departments)
    ? input.departments.filter((d): d is string => typeof d === "string" && (ENGAGEMENT_DEPARTMENTS as readonly string[]).includes(d))
    : [];
  const minAggregate = Math.min(100, Math.max(1, Number(input.minAggregateResponses ?? 5)));
  const id = typeof input.id === "string" ? input.id : randomUUID();
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "upsert",
      table: "team_engagement_voice_surveys",
      conflict: ["id"],
      values: {
        id,
        title: title.trim(),
        introduction,
        anonymity_mode: anonymityMode,
        status: "draft",
        departments,
        min_aggregate_responses: minAggregate,
        created_by_user_id: ctx.actor.userId,
        created_by_name: ctx.actor.name,
        created_at: now,
        updated_at: now
      }
    }
  ]);

  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (questions.length) {
    await ctx.db.commit([
      {
        op: "delete",
        table: "team_engagement_voice_questions",
        match: { survey_id: id }
      }
    ]);
    const qOps: DbOp[] = [];
    questions.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const prompt = text((raw as { prompt?: unknown }).prompt, 400);
      if (prompt.length < 3) return;
      const questionType = oneOf((raw as { questionType?: unknown }).questionType, VOICE_QUESTION_TYPES, "question type");
      qOps.push({
        op: "insert",
        table: "team_engagement_voice_questions",
        values: {
          id: randomUUID(),
          survey_id: id,
          prompt: prompt.trim(),
          question_type: questionType,
          options: Array.isArray((raw as { options?: unknown }).options) ? (raw as { options: unknown[] }).options : [],
          required: (raw as { required?: unknown }).required !== false,
          sort_order: index
        }
      });
    });
    if (qOps.length) await ctx.db.commit(qOps);
  }
  return { id };
}

export async function publishVoiceSurvey(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const now = nowIso(ctx);
  await ctx.db.commit([
    {
      op: "update",
      table: "team_engagement_voice_surveys",
      match: { id },
      set: { status: "active", publish_at: now, updated_at: now },
      expectRows: 1
    }
  ]);
  const directory = await ctx.directory();
  for (const employee of directory.employees) {
    if (!employee.active) continue;
    try {
      await ctx.notify({
        recipientUserId: employee.userId,
        title: "New Employee Voice survey",
        body: "A new team survey is ready in The Pack.",
        dedupeKey: `voice_survey:${id}:published:${employee.userId}`
      });
    } catch {
      // Best-effort.
    }
  }
  return { id };
}

/** Aggregate results only. Anonymous surveys never return respondent identity. */
export async function voiceSurveyResults(ctx: ServiceContext, input: { id?: unknown }) {
  requireStorage(ctx);
  if (!ctx.actor.tier) throw forbiddenError();
  const id = requireUuid(input.id, "id");
  const { rows } = await ctx.db.select<SurveyRow>("team_engagement_voice_surveys", {
    filters: [{ column: "id", op: "eq", value: id }],
    limit: 1
  });
  const survey = rows[0];
  if (!survey) throw notFoundError("Survey");
  const { rows: questions } = await ctx.db.select<QuestionRow>("team_engagement_voice_questions", {
    filters: [{ column: "survey_id", op: "eq", value: id }],
    order: [{ column: "sort_order", ascending: true }],
    limit: 50
  });

  const results = [];
  for (const question of questions) {
    if (survey.anonymity_mode === "anonymous") {
      const { rows: responses, total } = await ctx.db.select<{ answer: unknown }>("team_engagement_voice_anonymous_responses", {
        filters: [
          { column: "survey_id", op: "eq", value: id },
          { column: "question_id", op: "eq", value: question.id }
        ],
        limit: 5000,
        count: true
      });
      const count = total ?? responses.length;
      const payload: Record<string, unknown> = {
        questionId: question.id,
        prompt: question.prompt,
        questionType: question.question_type,
        responseCount: count,
        suppressed: count < survey.min_aggregate_responses
      };
      if (!payload.suppressed) {
        if (question.question_type === "text") {
          payload.samples = responses.slice(0, 25).map((row) => String(row.answer ?? ""));
        } else {
          const dist = new Map<string, number>();
          for (const row of responses) {
            const key = String(row.answer ?? "");
            dist.set(key, (dist.get(key) ?? 0) + 1);
          }
          payload.distribution = Object.fromEntries(dist);
        }
      }
      results.push(payload);
    } else {
      const { rows: responses, total } = await ctx.db.select<{ responder_name: string; answer: unknown }>("team_engagement_voice_responses", {
        filters: [
          { column: "survey_id", op: "eq", value: id },
          { column: "question_id", op: "eq", value: question.id }
        ],
        limit: 500,
        count: true
      });
      results.push({
        questionId: question.id,
        prompt: question.prompt,
        questionType: question.question_type,
        responseCount: total ?? responses.length,
        responses: responses.map((row) => ({ name: row.responder_name, answer: row.answer }))
      });
    }
  }

  return {
    survey: { id: survey.id, title: survey.title, anonymityMode: survey.anonymity_mode, minAggregate: survey.min_aggregate_responses },
    questions: results
  };
}