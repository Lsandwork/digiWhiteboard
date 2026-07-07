/** Strip markdown formatting so AI replies read as plain, human text in the UI. */
export function stripMarkdownFormatting(text: string): string {
  let result = text.trim();

  // Horizontal rules (---, ***, ___)
  result = result.replace(/^\s*([-*_]){3,}\s*$/gm, "");

  // Bold / italic (***x***, **x**, *x*)
  result = result.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
  result = result.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1");

  // Underscore variants
  result = result.replace(/__([^_]+)__/g, "$1");
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1");

  // Markdown headings
  result = result.replace(/^#{1,6}\s+/gm, "");

  // Bullet lines: keep readable bullets without raw asterisks
  result = result.replace(/^\s*\*\s+/gm, "• ");

  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

export function userRequestedDetailedAiReply(message: string): boolean {
  return /\b(draft|write (it|up|the)|template|full (text|draft|warning)|exact wording|what should i (say|write|include)|give me (a |the )?(draft|template|warning)|show me (a |the )?draft|written warning:|script for)\b/i.test(
    message
  );
}

export function buildConversationalStyleHint(params: {
  userMessage: string;
  priorUserTurns: number;
}): string {
  const wantsDetail = userRequestedDetailedAiReply(params.userMessage);
  if (wantsDetail) {
    return "The manager asked for detail or a draft. You may go longer, but stay conversational, plain text only, no markdown.";
  }
  if (params.priorUserTurns === 0) {
    return "First message on this topic: reply in 2-4 short sentences (~40-80 words). Ask ONE good follow-up question. Do not dump templates, bullet checklists, or full document drafts yet.";
  }
  return "Keep this reply concise and conversational (~40-120 words unless they asked for a draft). Plain text only, no markdown.";
}
