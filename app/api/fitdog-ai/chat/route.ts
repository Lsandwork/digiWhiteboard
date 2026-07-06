import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { generateFitdogText, fitdogAiUserFacingError, isGeminiConfigured } from "@/lib/ai/geminiClient";
import { buildFitdogAiSystemPrompt, buildFitdogAiUserPrompt } from "@/lib/ai/fitdogAiPrompt";
import { buildFitdogUserContext } from "@/lib/ai/fitdogUserContext";
import {
  detectToneHint,
  guardChatResponse,
  normalizeChatJson,
  parseGeminiJson,
  type GeminiChatJson
} from "@/lib/ai/fitdogAiGuards";
import { fallbackActionLinks } from "@/lib/ai/fitdogActionLinks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ configured: isGeminiConfigured() });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session) return unauthorizedAdminResponse();

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "Fitdog AI is not configured yet. Ask an admin to add GEMINI_API_KEY in Vercel." },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
    }

    const currentPage = String(body.currentPage ?? "").trim() || undefined;
    const recentContext =
      body.recentContext && typeof body.recentContext === "object"
        ? (body.recentContext as Record<string, unknown>)
        : undefined;

    const context = await buildFitdogUserContext({ session, currentPage });
    const toneHint = detectToneHint(message);
    const systemInstruction = buildFitdogAiSystemPrompt(context);
    const userPrompt = buildFitdogAiUserPrompt({ message, context, toneHint, recentContext });

    const { text } = await generateFitdogText({
      systemInstruction,
      userMessage: userPrompt,
      jsonMode: true
    });

    const fallback: GeminiChatJson = {
      reply:
        "I'm having trouble shaping a full answer right now, but don't let this sit. Write down the time, dogs involved, and what you saw while it's fresh.",
      actionIntent: toneHint === "safety" ? "front_desk_log" : "file_complaint",
      secondaryActionIntent: "complaints_filed",
      tone: toneHint ?? "normal",
      needsEscalation: toneHint === "safety",
      escalationReason: toneHint === "safety" ? "Possible safety concern mentioned." : ""
    };

    const parsed = normalizeChatJson(parseGeminiJson<Partial<GeminiChatJson>>(text, fallback), fallback.reply);
    const guarded = guardChatResponse({ access: context.access, parsed, toneHint });

    return NextResponse.json({
      reply: guarded.reply,
      actionLinks: guarded.actionLinks,
      suggestedNextStep: guarded.suggestedNextStep,
      tone: guarded.tone
    });
  } catch (error) {
    console.error("[fitdog-ai/chat] Request failed:", error);
    const session = getAdminSessionFromRequest(request);
    const context = session ? await buildFitdogUserContext({ session }) : null;
    return NextResponse.json(
      {
        error: fitdogAiUserFacingError(error),
        reply:
          "I'm having trouble responding right now, but don't let the issue sit. Document what you saw while it's fresh and use the right Fitdog workflow.",
        actionLinks: context ? fallbackActionLinks(context.access, "normal") : [],
        tone: "normal"
      },
      { status: 500 }
    );
  }
}
