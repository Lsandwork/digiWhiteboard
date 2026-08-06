const PREFERRED_VOICE_PATTERNS = [
  /samantha/i,
  /ava/i,
  /allison/i,
  /karen/i,
  /moira/i,
  /serena/i,
  /victoria/i,
  /zira/i,
  /jenny/i,
  /aria/i,
  /natural/i,
  /neural/i,
  /premium/i,
  /enhanced/i,
  /google us english/i,
  /english \(united states\)/i
];

const AVOID_VOICE_PATTERNS = [/fred/i, /bad news/i, /bells/i, /boing/i, /whisper/i, /compact/i, /robot/i];

export function rankSpeechVoice(voice: SpeechSynthesisVoice) {
  let score = 0;
  const label = `${voice.name} ${voice.lang}`.toLowerCase();

  if (voice.lang.toLowerCase().startsWith("en")) score += 20;
  if (voice.lang.toLowerCase() === "en-us") score += 10;
  if (voice.localService) score += 4;

  for (const pattern of PREFERRED_VOICE_PATTERNS) {
    if (pattern.test(label)) score += 12;
  }
  for (const pattern of AVOID_VOICE_PATTERNS) {
    if (pattern.test(label)) score -= 20;
  }

  return score;
}

export function pickBestSpeechVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  return [...pool].sort((a, b) => rankSpeechVoice(b) - rankSpeechVoice(a))[0] ?? null;
}

export function chunkSpeechText(text: string, maxLength = 3200) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLength) return [cleaned];

  const chunks: string[] = [];
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
