function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      if (/^###\s+/.test(block)) return `<h3>${escapeHtml(block.replace(/^###\s+/, ""))}</h3>`;
      if (/^##\s+/.test(block)) return `<h2>${escapeHtml(block.replace(/^##\s+/, ""))}</h2>`;
      if (/^#\s+/.test(block)) return `<h2>${escapeHtml(block.replace(/^#\s+/, ""))}</h2>`;
      if (/^[-*]\s+\[[ xX]\]\s+/m.test(block) || /^[-*]\s+/m.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const checkbox = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
            if (checkbox) {
              const checked = checkbox[1].toLowerCase() === "x";
              return `<li><input type="checkbox" disabled ${checked ? "checked" : ""}/> ${escapeHtml(checkbox[2])}</li>`;
            }
            return `<li>${escapeHtml(line.replace(/^[-*]\s+/, ""))}</li>`;
          });
        return `<ul>${items.join("")}</ul>`;
      }
      const withInline = escapeHtml(block)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
      return `<p>${withInline}</p>`;
    })
    .join("\n");
}
