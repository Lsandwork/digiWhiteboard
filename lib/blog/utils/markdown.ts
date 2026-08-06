function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isUnorderedListBlock(block: string) {
  return /^[-*]\s+\[[ xX]\]\s+/m.test(block) || /^[-*]\s+/m.test(block);
}

function isOrderedListBlock(block: string) {
  return /^\d+\.\s+/m.test(block);
}

/** Lightweight markdown → HTML for Fitdog blog articles (headings, paragraphs, lists, checkboxes). */
export function markdownToSimpleHtml(markdown: string): string {
  const blocks = markdown
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      if (/^###\s+/.test(block)) return `<h3>${formatInline(block.replace(/^###\s+/, ""))}</h3>`;
      if (/^##\s+/.test(block)) return `<h2>${formatInline(block.replace(/^##\s+/, ""))}</h2>`;
      if (/^#\s+/.test(block)) return `<h2>${formatInline(block.replace(/^#\s+/, ""))}</h2>`;

      if (isUnorderedListBlock(block)) {
        const items = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const checkbox = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
            if (checkbox) {
              const checked = checkbox[1].toLowerCase() === "x";
              return `<li><label><input type="checkbox" disabled ${checked ? "checked" : ""}/> <span>${formatInline(checkbox[2])}</span></label></li>`;
            }
            return `<li>${formatInline(line.replace(/^[-*]\s+/, ""))}</li>`;
          });
        return `<ul>${items.join("")}</ul>`;
      }

      if (isOrderedListBlock(block)) {
        const items = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => `<li>${formatInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
        return `<ol>${items.join("")}</ol>`;
      }

      const withBreaks = formatInline(block).replace(/\n/g, "<br />");
      return `<p>${withBreaks}</p>`;
    })
    .join("\n");
}
