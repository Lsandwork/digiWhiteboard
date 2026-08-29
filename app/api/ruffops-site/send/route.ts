import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import { SITE } from "@/lib/ruffops-site/config";

export const runtime = "nodejs";

function asText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (asText(form.get("company"))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const fields: string[] = [];
  form.forEach((value, key) => {
    if (key === "company") return;
    if (typeof value === "string" && value.trim()) fields.push(`${key}: ${value.trim()}`);
  });

  const formType = asText(form.get("form_type")) || "Website inquiry";
  const name = asText(form.get("name"));
  const email = asText(form.get("email"));
  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const body = fields.join("\n");
  const provider = getEmailProvider();
  if (provider.isConfigured()) {
    const result = await provider.send({
      to: SITE.email,
      subject: `RuffOps ${formType}${name ? ` — ${name}` : ""}`,
      text: body,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${body.replace(/</g, "&lt;")}</pre>`,
      purpose: "marketing"
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || "Send failed" }, { status: 502 });
    }
  }

  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ ok: true, emailed: provider.isConfigured() });
  }
  return NextResponse.redirect(new URL("/contact?submit=ok", request.url), 302);
}
