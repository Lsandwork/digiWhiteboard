import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import {
  BROWSER_JAR_COOKIE,
  buildBrowserProxyUrl,
  encodeBrowserCookieJar,
  mergeSetCookieHeaders,
  parseBrowserTarget,
  readBrowserJarCookie,
  rewriteHtmlForBrowserProxy,
  trimBrowserCookieJar
} from "@/lib/admin/browser";

export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 30_000;

function proxyBaseFromRequest(request: Request): string {
  const origin = new URL(request.url).origin;
  return `${origin}${buildBrowserProxyUrl("")}`.replace(/\?url=$/, "?url=");
}

async function proxyBrowserRequest(request: Request, target: URL, method: "GET" | "POST", body?: ArrayBuffer) {
  const cookieHeader = request.headers.get("cookie");
  const jar = readBrowserJarCookie(cookieHeader);
  const host = target.hostname;
  const upstreamHeaders = new Headers({
    "User-Agent": "Mozilla/5.0 (compatible; FitdogStaffBrowser/1.0)",
    Accept: request.headers.get("accept") ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
  });

  if (jar[host]) {
    upstreamHeaders.set("Cookie", jar[host]);
  }

  if (method === "POST" && body) {
    const contentType = request.headers.get("content-type");
    if (contentType) upstreamHeaders.set("Content-Type", contentType);
  }

  const upstream = await fetch(target.toString(), {
    method,
    headers: upstreamHeaders,
    body: method === "POST" ? body : undefined,
    redirect: "follow",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  const nextJar = trimBrowserCookieJar(
    {
      ...jar,
      [host]: mergeSetCookieHeaders(jar[host], setCookies, host)
    },
    host
  );

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", contentType.split(";")[0]);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set(
    "Set-Cookie",
    `${BROWSER_JAR_COOKIE}=${encodeURIComponent(encodeBrowserCookieJar(nextJar))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 60 * 60}`
  );

  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    const rewritten = rewriteHtmlForBrowserProxy(html, new URL(upstream.url), proxyBaseFromRequest(request));
    return new NextResponse(rewritten, { status: upstream.status, headers: responseHeaders });
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  const target = parseBrowserTarget(urlParam);
  if (!target) {
    return NextResponse.json({ error: "Invalid or blocked URL." }, { status: 400 });
  }

  try {
    return await proxyBrowserRequest(request, target, "GET");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load page.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const urlParam = new URL(request.url).searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  const target = parseBrowserTarget(urlParam);
  if (!target) {
    return NextResponse.json({ error: "Invalid or blocked URL." }, { status: 400 });
  }

  try {
    const body = await request.arrayBuffer();
    return await proxyBrowserRequest(request, target, "POST", body.byteLength ? body : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit form.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
