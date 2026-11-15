/**
 * Analytics & Reporting reads real engagement records, keeps anonymous surveys anonymous,
 * and does not swap Bark Out senders with recipients.
 * Run: npx tsx scripts/test-team-engagement-analytics.ts
 */
import assert from "node:assert/strict";
import { analyticsIntelligence, engagementExportTable } from "@/lib/team-engagement/analytics-intelligence";
import { buildExport } from "@/lib/team-engagement/insights";
import { toPdf } from "@/lib/team-engagement/export-formats";
import { EngagementError } from "@/lib/team-engagement/errors";
import { PEOPLE, actorFor, seededDb, serviceContextFor } from "./team-engagement-fixtures";

const FROM = "2026-10-15";
const TO = "2026-11-13";
const WHEN = "2026-11-10T18:00:00.000Z";
const NOTE = "Bath station was fully stocked.";
const VOICE = "No incidents.";
const FUN = "All good! Happy dogs.";
const FEEDBACK = "The dryer in room two is loud.";
const BARK = "Thanks for covering the bath station during the lunch rush today.";
const SECRET = "secret-anon-answer-should-never-leak";
const DAYCARE = "Daycare only note";

function seed() {
  const db = seededDb();
  db.tables.team_engagement_team_pulse_responses.push(
    {
      id: "bbbbbbbb-0000-4000-8000-000000000001",
      responder_user_id: PEOPLE.groomer.id,
      week_start: "2026-11-09",
      workload_rating: 2,
      support_rating: 5,
      connection_rating: 4,
      note: NOTE,
      created_at: WHEN
    },
    {
      id: "bbbbbbbb-0000-4000-8000-000000000002",
      responder_user_id: PEOPLE.handler.id,
      week_start: "2026-11-09",
      workload_rating: 1,
      support_rating: 1,
      connection_rating: 1,
      note: DAYCARE,
      created_at: WHEN
    }
  );
  db.tables.team_engagement_voice_surveys.push(
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      title: "Shift check",
      anonymity_mode: "identified",
      departments: ["grooming"],
      min_aggregate_responses: 5,
      status: "active"
    },
    {
      id: "cccccccc-0000-4000-8000-000000000002",
      title: "Private check",
      anonymity_mode: "anonymous",
      departments: [],
      min_aggregate_responses: 5,
      status: "active"
    }
  );
  db.tables.team_engagement_voice_questions.push(
    {
      id: "dddddddd-0000-4000-8000-000000000001",
      survey_id: "cccccccc-0000-4000-8000-000000000001",
      prompt: "Any incidents?",
      question_type: "text",
      sort_order: 1
    },
    {
      id: "dddddddd-0000-4000-8000-000000000002",
      survey_id: "cccccccc-0000-4000-8000-000000000002",
      prompt: "Anonymous prompt",
      question_type: "text",
      sort_order: 1
    }
  );
  db.tables.team_engagement_voice_responses.push({
    id: "eeeeeeee-0000-4000-8000-000000000001",
    survey_id: "cccccccc-0000-4000-8000-000000000001",
    question_id: "dddddddd-0000-4000-8000-000000000001",
    responder_user_id: PEOPLE.groomer.id,
    responder_name: PEOPLE.groomer.name,
    answer: VOICE,
    created_at: WHEN
  });
  db.tables.team_engagement_voice_anonymous_responses.push({
    id: "eeeeeeee-0000-4000-8000-000000000002",
    survey_id: "cccccccc-0000-4000-8000-000000000002",
    question_id: "dddddddd-0000-4000-8000-000000000002",
    answer: SECRET,
    created_at: WHEN
  });
  db.tables.team_engagement_fun_questions.push({
    id: "ffffffff-0000-4000-8000-000000000001",
    prompt: "How's the pack?",
    status: "active"
  });
  db.tables.team_engagement_fun_question_responses.push({
    id: "ffffffff-0000-4000-8000-000000000002",
    question_id: "ffffffff-0000-4000-8000-000000000001",
    responder_user_id: PEOPLE.groomer.id,
    responder_name: PEOPLE.groomer.name,
    body: FUN,
    created_at: WHEN
  });
  db.tables.team_engagement_feedback.push({
    id: "99999999-0000-4000-8000-000000000001",
    submitter_user_id: PEOPLE.groomer.id,
    submitter_name: PEOPLE.groomer.name,
    submitter_departments: ["grooming"],
    category: "equipment",
    subject: "Dryer noise",
    details: FEEDBACK,
    status: "submitted",
    created_at: WHEN
  });
  db.tables.team_engagement_bark_outs.push({
    id: "88888888-0000-4000-8000-000000000001",
    author_user_id: PEOPLE.groomer.id,
    author_name: PEOPLE.groomer.name,
    author_departments: ["grooming"],
    recipient_user_id: PEOPLE.groomer2.id,
    recipient_name: PEOPLE.groomer2.name,
    recipient_departments: ["grooming"],
    category: "teamwork",
    message: BARK,
    context: null,
    status: "published",
    published_at: WHEN,
    created_at: WHEN
  });
  return db;
}

function answers(payload: Awaited<ReturnType<typeof analyticsIntelligence>>) {
  return payload.responses?.items.map((row) => row.answer) ?? [];
}

async function main() {
  const db = seed();
  const data = await analyticsIntelligence(serviceContextFor(db, actorFor(PEOPLE.superAdmin)), {
    from: FROM,
    to: TO,
    tab: "responses"
  });
  const text = JSON.stringify(data);
  assert.equal(text.includes(SECRET), false, "anonymous answer text is not returned");
  assert.ok(data.anonymous.withheldAnswers >= 1, "anonymous answers below the minimum are counted as withheld");
  assert.ok(answers(data).includes(NOTE), "pulse note is preserved exactly");
  assert.ok(answers(data).includes(VOICE), "survey answer is preserved exactly");
  assert.ok(answers(data).includes(FUN), "fun zone answer is preserved exactly");
  assert.ok(answers(data).includes(FEEDBACK), "suggestion text is preserved exactly");
  assert.equal(data.kpis.teamRating.value, 2.3);
  assert.equal(data.kpis.responses.value, 11);
  assert.equal(data.kpis.barkOuts.value, 1);
  assert.equal(data.kpis.teamMembers.value, 11);
  assert.equal(data.kpis.engagementScore.value, 18);
  assert.equal(data.kpis.classification, null);
  assert.equal(data.filters.locationAvailable, false);
  assert.equal(data.filters.serviceAreaAvailable, false);
  const searched = await analyticsIntelligence(serviceContextFor(db, actorFor(PEOPLE.superAdmin)), {
    from: FROM,
    to: TO,
    tab: "responses",
    q: "dryer"
  });
  assert.deepEqual(searched.responses?.items.map((row) => row.answer), [FEEDBACK]);
  assert.equal(searched.kpis.responses.value, 11, "answer search does not change the overview response total");

  const manager = await analyticsIntelligence(serviceContextFor(db, actorFor(PEOPLE.groomingManager)), {
    from: FROM,
    to: TO,
    tab: "bark_outs"
  });
  assert.equal(JSON.stringify(manager).includes(DAYCARE), false, "a grooming manager does not see daycare answers");
  assert.equal(manager.kpis.teamMembers.value, 2);
  assert.equal(manager.kpis.teamRating.value, 3.7);
  assert.equal(manager.kpis.engagementScore.value, 50);
  assert.equal(JSON.stringify(manager).includes(NOTE), true);
  const bark = manager.barkOuts?.items[0];
  assert.ok(bark, "grooming Bark Out is in scope");
  assert.equal(bark?.givenBy, PEOPLE.groomer.name);
  assert.equal(bark?.receivedBy, PEOPLE.groomer2.name);
  assert.equal(bark?.message, BARK);

  await assert.rejects(
    analyticsIntelligence(serviceContextFor(db, actorFor(PEOPLE.groomingManager)), { department: "daycare" }),
    (error: unknown) => error instanceof EngagementError && error.status === 403
  );

  const exported = await buildExport(serviceContextFor(db, actorFor(PEOPLE.superAdmin)), {
    type: "staff_answers",
    from: FROM,
    to: TO
  });
  assert.match(exported.filename, /\.csv$/);
  assert.ok(exported.csv.includes(NOTE));
  assert.equal(exported.csv.includes(SECRET), false);
  const pdf = await buildExport(serviceContextFor(db, actorFor(PEOPLE.superAdmin)), {
    type: "staff_answers",
    from: FROM,
    to: TO,
    format: "pdf"
  });
  assert.ok(pdf.body instanceof Uint8Array);
  assert.equal(Buffer.from(pdf.body).subarray(0, 5).toString(), "%PDF-");
  assert.ok(Buffer.from(pdf.body).toString("latin1").includes(NOTE));
  const excel = await buildExport(serviceContextFor(db, actorFor(PEOPLE.groomingManager, { addPermissions: ["engagement.export"] })), {
    type: "staff_answers",
    from: FROM,
    to: TO,
    format: "xls"
  });
  assert.match(excel.filename, /\.xls$/);
  assert.ok(String(excel.body).includes(NOTE));
  assert.equal(String(excel.body).includes(DAYCARE), false);

  const table = await engagementExportTable(serviceContextFor(db, actorFor(PEOPLE.superAdmin)), {
    type: "bark_out_recognition",
    from: FROM,
    to: TO
  });
  const recognition = table.rows.find((row) => row[0] === "recognition");
  assert.equal(recognition?.[1], `${PEOPLE.groomer.name} gave recognition to ${PEOPLE.groomer2.name}`);
  assert.equal(recognition?.[2], BARK);

  const sample = toPdf("Sample", ["Answer"], [[NOTE]]);
  assert.equal(Buffer.from(sample).subarray(0, 5).toString(), "%PDF-");
  console.log("team engagement analytics ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
