/**
 * Safe display helpers for Gingr (and similar) fields that may contain HTML.
 * Tags must never appear as literal text in the UI.
 */

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;
const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "span", "div"]);

export function looksLikeHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlToPlainText(value: string): string {
  if (!value) return "";
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (/^\s*javascript:/i.test(trimmed)) return false;
  if (/^\s*data:/i.test(trimmed)) return false;
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed);
}

function sanitizeElement(el: Element): void {
  const tag = el.tagName.toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) {
      el.remove();
      return;
    }
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (tag === "a") {
      if (name === "href") {
        if (!isSafeHref(attr.value)) el.removeAttribute(attr.name);
        else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
        continue;
      }
      if (name === "target" || name === "rel") continue;
    }
    el.removeAttribute(attr.name);
  }

  for (const child of Array.from(el.children)) {
    sanitizeElement(child);
  }
}

/** Browser-safe sanitizer; Node tests use the plain-text fallback path. */
export function sanitizeRichHtml(dirty: string): string {
  const input = String(dirty ?? "").trim();
  if (!input) return "";

  if (typeof DOMParser === "undefined") {
    const plain = htmlToPlainText(input);
    if (!plain) return "";
    return plain
      .split(/\n+/)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
  }

  const doc = new DOMParser().parseFromString(input, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, button, textarea, svg").forEach((node) => {
    node.remove();
  });

  for (const child of Array.from(doc.body.children)) {
    sanitizeElement(child);
  }

  // Also sanitize any leftover text-level nodes wrapped oddly
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    sanitizeElement(el);
  }

  return doc.body.innerHTML.trim();
}

export function toDisplayHtml(value: string): { mode: "html" | "text"; html?: string; text?: string } {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return { mode: "text", text: "" };
  if (!looksLikeHtml(trimmed)) return { mode: "text", text: trimmed };
  return { mode: "html", html: sanitizeRichHtml(trimmed) };
}
