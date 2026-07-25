import assert from "node:assert/strict";
import {
  escapeHtml,
  htmlToPlainText,
  looksLikeHtml,
  sanitizeRichHtml,
  toDisplayHtml
} from "../lib/html/rich-text";

const gingrNotes =
  "<p>Written By Dj H. in regard to an altercation prior to my shift. </p> <p>&nbsp;&nbsp;&nbsp;During a handler handoff...</p>";

assert.equal(looksLikeHtml(gingrNotes), true);
assert.equal(looksLikeHtml("Plain staff note"), false);

const plain = htmlToPlainText(gingrNotes);
assert.ok(!plain.includes("<p>"), "plain text must not include tags");
assert.ok(!plain.includes("&nbsp;"), "plain text must decode nbsp");
assert.match(plain, /Written By Dj H/);
assert.match(plain, /During a handler handoff/);

const display = toDisplayHtml(gingrNotes);
assert.equal(display.mode, "html");
assert.ok(display.html);
assert.ok(!display.html!.includes("<script"), "scripts stripped");
assert.match(display.html!, /<p>/i);

const xss = sanitizeRichHtml('<p onclick="alert(1)">Safe</p><script>alert(2)</script><a href="javascript:alert(3)">x</a>');
assert.ok(!xss.toLowerCase().includes("script"));
assert.ok(!xss.toLowerCase().includes("onclick"));
assert.ok(!xss.toLowerCase().includes("javascript:"));
assert.match(xss, /Safe/);

assert.equal(escapeHtml("<b>x</b>"), "&lt;b&gt;x&lt;/b&gt;");

const plainDisplay = toDisplayHtml("Just a note\nwith lines");
assert.equal(plainDisplay.mode, "text");
assert.equal(plainDisplay.text, "Just a note\nwith lines");

console.log("rich text tests passed");
