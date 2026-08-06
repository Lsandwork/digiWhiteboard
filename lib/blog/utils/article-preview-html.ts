import { markdownToSimpleHtml } from "@/lib/blog/utils/markdown";

export function addArticleHeadingIds(html: string) {
  return html.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level: string, text: string) => {
    const id = String(text)
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

export function buildArticlePreviewHtml(markdown: string, storedHtml?: string | null) {
  const trimmed = markdown.trim();
  if (trimmed) {
    return addArticleHeadingIds(markdownToSimpleHtml(trimmed));
  }
  if (storedHtml?.trim()) {
    return addArticleHeadingIds(storedHtml);
  }
  return "<p><em>Start writing to see a live preview.</em></p>";
}

export function estimateReadingMinutes(markdown: string) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
