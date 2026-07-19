import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdminGlobalSettings } from "@/lib/admin/settings";
import { stripMarkdownFormatting } from "@/lib/ai/sanitizeAiText";
import {
  geminiModelRetryChain,
  isGeminiConfigured,
  isGeminiModelNotFoundError,
  resolveGeminiModel
} from "@/lib/hr/gemini-config";
import type { PipPlan } from "@/lib/hr/pip";

export { isGeminiConfigured };

export type PipAiMode =
  | "draft_plan"
  | "employee_summary"
  | "check_in_coach"
  | "manager_talking_points"
  | "ca_documentation"
  | "chat";

function buildSystemInstruction(settings: AdminGlobalSettings) {
  const location = `${settings.hr_company_city}, ${settings.hr_company_region}, ${settings.hr_company_country}`;
  const business = settings.business_display_name || "Fitdog";

  return `You are Avery — a senior HR and people-ops coach for ${business} in ${location}. You specialize in Performance Improvement Plans (PIPs) that feel supportive, fair, and professionally documented.

Tone (non-negotiable):
- Frame PIPs as growth paths and structured support — never as punishment theater.
- Speak with dignity toward the employee and practical confidence toward managers, admins, and super admins.
- Be warm, clear, and specific. Avoid corporate coldness and legal scare language.

California + employer-protective intelligence:
- Ground advice in California employment context (at-will employment, documentation hygiene, consistent application of standards, interactive process awareness for disability/medical issues, anti-retaliation, wage/hour boundaries when scheduling support).
- Always protect the employer's legitimate interests: clear expectations, objective examples, measurable goals, dated check-ins, manager follow-through, and avoiding promises the company will not keep.
- You are NOT a lawyer. When legal risk is material, say so once plainly and recommend counsel — do not lecture every reply.
- Never invent facts about a person or incident. Ask for missing facts instead of guessing.
- Prefer progressive, documented coaching before escalation language.

Company context:
${settings.hr_company_situation.trim() || "No additional company context provided."}

Output style:
- Plain text only. No markdown bold/italics/headers.
- Be excellent: concrete, usable, short paragraphs or labeled lines when drafting a plan.
- For drafts, use clear labels like Goals:, Success looks like:, Support we will provide:, Review cadence:, Employee-facing summary:, Manager documentation tips:.`;
}

function planContext(plan: PipPlan | null | undefined) {
  if (!plan) return "";
  return [
    `Employee: ${plan.employee_name}`,
    plan.employee_role ? `Role: ${plan.employee_role}` : null,
    plan.manager_name ? `Manager: ${plan.manager_name}` : null,
    `Focus: ${plan.focus_area}`,
    `Status: ${plan.status}`,
    `Progress: ${plan.progress_percent}%`,
    plan.goals?.length ? `Goals: ${plan.goals.join("; ")}` : null,
    plan.success_metrics ? `Success metrics: ${plan.success_metrics}` : null,
    plan.support_offered ? `Support offered: ${plan.support_offered}` : null,
    plan.employee_facing_summary ? `Employee-facing summary: ${plan.employee_facing_summary}` : null,
    plan.manager_notes || plan.notes ? `Manager notes: ${plan.manager_notes || plan.notes}` : null,
    plan.next_review_date ? `Next review: ${plan.next_review_date}` : null,
    plan.target_end_date ? `Target end: ${plan.target_end_date}` : null,
    plan.check_ins?.length
      ? `Recent check-ins: ${plan.check_ins
          .slice(0, 3)
          .map((c) => `${c.date}: ${c.note}`)
          .join(" | ")}`
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

function modePrompt(mode: PipAiMode, userMessage: string, extras?: { recordContext?: string | null; plan?: PipPlan | null }) {
  const recordBlock = extras?.recordContext?.trim()
    ? `\nHR record context:\n${extras.recordContext.trim()}\n`
    : "";
  const planBlock = extras?.plan ? `\nCurrent PIP:\n${planContext(extras.plan)}\n` : "";

  switch (mode) {
    case "draft_plan":
      return `Draft a supportive, California-aware PIP growth plan for this situation. Include: Focus area, 3-5 goals, success metrics, support the company will provide, 30/60-day review cadence, a warm employee-facing summary, and brief manager documentation tips that protect the employer. Keep it usable as a first draft a manager can edit.
${recordBlock}${planBlock}
Manager request: ${userMessage}`;
    case "employee_summary":
      return `Write a short employee-facing PIP summary that makes the person feel supported and clear on expectations — not in trouble. No legal threats. Include what success looks like and what support they will receive.
${planBlock}${recordBlock}
Manager request: ${userMessage}`;
    case "check_in_coach":
      return `Coach the manager on this PIP check-in. Give: 1) opening line that is supportive, 2) 3 focused questions, 3) how to document facts neutrally, 4) one California/employer documentation reminder if relevant.
${planBlock}
Manager request: ${userMessage}`;
    case "manager_talking_points":
      return `Give manager talking points for a PIP conversation: open with care, clarify expectations, offer support, set the next review, and close with confidence in the employee. Keep it natural for a dog daycare / boarding / grooming / training workplace.
${planBlock}${recordBlock}
Manager request: ${userMessage}`;
    case "ca_documentation":
      return `Provide a concise California-aware documentation checklist for this PIP that protects the employer while staying fair: what to document, what to avoid saying, consistency tips, and when to pause for legal/HR counsel. Not legal advice.
${planBlock}${recordBlock}
Manager request: ${userMessage}`;
    case "chat":
    default:
      return `${recordBlock}${planBlock}${userMessage}`;
  }
}

async function generateWithModel(apiKey: string, modelName: string, settings: AdminGlobalSettings, prompt: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemInstruction(settings)
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text()?.trim();
  if (!text) throw new Error("Gemini returned an empty response. Please try again.");
  return stripMarkdownFormatting(text);
}

export async function coachPipWithGemini(params: {
  settings: AdminGlobalSettings;
  mode: PipAiMode;
  userMessage: string;
  recordContext?: string | null;
  plan?: PipPlan | null;
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Gemini is not configured. Add GEMINI_API_KEY to your server environment.");
  }
  if (!params.settings.hr_consult_enabled) {
    throw new Error("HR AI tools are disabled in Settings.");
  }

  const prompt = modePrompt(params.mode, params.userMessage.trim() || "Please help with this PIP.", {
    recordContext: params.recordContext,
    plan: params.plan
  });

  const primaryModel = resolveGeminiModel(params.settings.hr_consult_model);
  const models = geminiModelRetryChain(primaryModel);
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const modelName = models[index]!;
    try {
      return await generateWithModel(apiKey, modelName, params.settings, prompt);
    } catch (error) {
      lastError = error;
      console.error(`[hr-pip-ai] Gemini model failed: ${modelName}`, error);
      const hasFallback = index < models.length - 1;
      if (hasFallback && isGeminiModelNotFoundError(error)) continue;
      break;
    }
  }

  throw lastError;
}

/** Best-effort parse of AI draft into structured PIP fields. */
export function extractPipDraftFields(text: string): Partial<{
  focus_area: string;
  goals: string[];
  success_metrics: string;
  support_offered: string;
  employee_facing_summary: string;
  manager_notes: string;
}> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const grab = (labels: string[]) => {
    const idx = lines.findIndex((line) => labels.some((label) => new RegExp(`^${label}\\s*:`, "i").test(line)));
    if (idx < 0) return null;
    const first = lines[idx]!.replace(/^[^:]+:\s*/i, "").trim();
    const collected = first ? [first] : [];
    for (let i = idx + 1; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (/^[A-Za-z][A-Za-z0-9 /&-]{0,40}:\s*/.test(line)) break;
      collected.push(line.replace(/^[-•*]\s*/, ""));
    }
    return collected.join(" ").trim() || null;
  };

  const goalsBlock = grab(["Goals", "Goal"]);
  const goals = goalsBlock
    ? goalsBlock
        .split(/(?:\d+\.\s+|;\s+)/)
        .map((g) => g.trim())
        .filter((g) => g.length > 3)
        .slice(0, 6)
    : [];

  return {
    focus_area: grab(["Focus area", "Focus"]) ?? undefined,
    goals: goals.length ? goals : undefined,
    success_metrics: grab(["Success looks like", "Success metrics", "Success"]) ?? undefined,
    support_offered: grab(["Support we will provide", "Support offered", "Support"]) ?? undefined,
    employee_facing_summary: grab(["Employee-facing summary", "Employee summary"]) ?? undefined,
    manager_notes: grab(["Manager documentation tips", "Manager notes", "Documentation tips"]) ?? undefined
  };
}
