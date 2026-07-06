import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { analyzeFitdogVideo, fitdogAiUserFacingError, isGeminiConfigured } from "@/lib/ai/geminiClient";
import { buildFitdogVideoSystemPrompt, buildFitdogVideoUserPrompt } from "@/lib/ai/fitdogVideoPrompt";
import { buildFitdogUserContext } from "@/lib/ai/fitdogUserContext";
import {
  MAX_VIDEO_BYTES,
  SUPPORTED_VIDEO_MIME_TYPES,
  detectToneHint,
  guardVideoResponse,
  normalizeVideoJson,
  parseGeminiJson,
  type GeminiVideoJson
} from "@/lib/ai/fitdogAiGuards";
import { fallbackActionLinks } from "@/lib/ai/fitdogActionLinks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const form = await request.formData();
    const file = form.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please choose a video file to scan." }, { status: 400 });
    }

    if (file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        {
          error: "This video is too large to scan here. Trim it to the key moment and upload again."
        },
        { status: 413 }
      );
    }

    const mimeType = file.type || "video/mp4";
    if (!SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "This file type isn't supported for scanning. Try MP4, MOV, or WEBM." },
        { status: 400 }
      );
    }

    const userNote = String(form.get("userNote") ?? "").trim() || undefined;
    const currentPage = String(form.get("currentPage") ?? "").trim() || undefined;
    const toneHint = detectToneHint(`${userNote ?? ""} ${file.name}`);

    const context = await buildFitdogUserContext({ session, currentPage });
    const buffer = Buffer.from(await file.arrayBuffer());

    const { text } = await analyzeFitdogVideo({
      buffer,
      mimeType,
      displayName: file.name.slice(0, 120),
      systemInstruction: buildFitdogVideoSystemPrompt(context),
      userPrompt: buildFitdogVideoUserPrompt({ userNote, context, toneHint })
    });

    const fallback: GeminiVideoJson = {
      reply:
        "The clip is too unclear to call it either way, but it still may be worth documenting. Stick to what you can see: time, dog name, location, staff present, and what happened right before and after if you personally know it.",
      summary: "",
      timeline: [],
      keyObservations: [],
      safetyConcerns: toneHint === "safety" ? ["Possible safety concern in the note or filename."] : [],
      dogBodyLanguage: [],
      staffHandlingNotes: [],
      recommendedNextSteps: ["Notify a team lead or manager if dogs or staff may be at risk.", "Document what the clip shows."],
      documentationSuggestion: "Write a short Front Desk Log note with time, dogs, and what is visible.",
      suggestedLogText: "",
      actionIntent: toneHint === "safety" ? "front_desk_log" : "file_complaint",
      secondaryActionIntent: "complaints_filed",
      tone: toneHint ?? "normal",
      needsEscalation: toneHint === "safety",
      escalationReason: toneHint === "safety" ? "Possible safety concern." : ""
    };

    const parsed = normalizeVideoJson(parseGeminiJson<Partial<GeminiVideoJson>>(text, fallback), fallback.reply);
    const guarded = guardVideoResponse({ access: context.access, parsed, toneHint });

    return NextResponse.json(guarded);
  } catch (error) {
    console.error("[fitdog-ai/video-scan] Request failed:", error);
    const session = getAdminSessionFromRequest(request);
    const context = session ? await buildFitdogUserContext({ session }) : null;
    const links = context ? fallbackActionLinks(context.access, "safety") : [];

    return NextResponse.json(
      {
        error: fitdogAiUserFacingError(error),
        reply:
          "I'm having trouble scanning the video right now, but don't let the issue sit. Document what you saw while it's fresh and attach the video through the proper workflow if your role allows it.",
        actionLinks: links,
        tone: "normal"
      },
      { status: 500 }
    );
  }
}
