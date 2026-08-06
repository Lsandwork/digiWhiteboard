import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { chunkSpeechText } from "@/lib/blog/utils/natural-speech-voice";

export const dynamic = "force-dynamic";

const OPENAI_TTS_MAX = 4096;

async function synthesizeOpenAiSpeech(text: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const voice = process.env.BLOG_TTS_VOICE?.trim() || "nova";
  const model = process.env.BLOG_TTS_MODEL?.trim() || "tts-1-hd";

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: text.slice(0, OPENAI_TTS_MAX),
      response_format: "mp3"
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || "OpenAI speech synthesis failed");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

export async function POST(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;

  let body: { text?: string; chunkIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(body.text || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const chunks = chunkSpeechText(text, 3200);
  const chunkIndex = Number.isFinite(body.chunkIndex) ? Number(body.chunkIndex) : 0;
  const chunk = chunks[chunkIndex] || chunks[0];
  if (!chunk) {
    return NextResponse.json({ error: "Nothing to read aloud" }, { status: 400 });
  }

  try {
    const audio = await synthesizeOpenAiSpeech(chunk);
    if (!audio) {
      return NextResponse.json({ available: false, reason: "not_configured" }, { status: 503 });
    }

    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Speech-Chunk-Index": String(chunkIndex),
        "X-Speech-Chunk-Total": String(chunks.length),
        "X-Speech-Provider": "openai"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        reason: "service_unavailable",
        error: error instanceof Error ? error.message : "Speech synthesis failed"
      },
      { status: 502 }
    );
  }
}
