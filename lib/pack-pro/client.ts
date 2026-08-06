import {
  PACK_PRO_REQUIRED_COURSES,
  type PackProCourseId
} from "@/lib/pack-pro/courses";
import { packProBaseUrl, packProEmail, packProGroupId, packProPassword } from "@/lib/pack-pro/config";

export type PackProRawLearnerProgress = {
  name: string;
  email: string;
  courses: Array<{
    course_id: PackProCourseId;
    course_title: string;
    percent: number;
  }>;
};

type CookieJar = Map<string, string>;

function parseSetCookie(header: string | null, jar: CookieJar) {
  if (!header) return;
  // undici may join multiple Set-Cookie with ", " — split carefully on ", " before cookie name=
  const parts = header.split(/,(?=\s*[^;=]+=)/);
  for (const part of parts) {
    const pair = part.split(";")[0]?.trim();
    if (!pair || !pair.includes("=")) continue;
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchWithCookies(url: string, jar: CookieJar, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const existing = cookieHeader(jar);
  if (existing) headers.set("cookie", existing);
  if (!headers.has("user-agent")) {
    headers.set(
      "user-agent",
      "FitdogDigiBoard/1.0 (+https://staff.ruffops.com; Pack Pro Training sync)"
    );
  }
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    for (const cookie of getSetCookie.call(response.headers)) {
      parseSetCookie(cookie, jar);
    }
  } else {
    parseSetCookie(response.headers.get("set-cookie"), jar);
  }
  return response;
}

async function followRedirects(url: string, jar: CookieJar, init?: RequestInit, max = 8) {
  let current = url;
  let response = await fetchWithCookies(current, jar, init);
  let hops = 0;
  while (response.status >= 300 && response.status < 400 && hops < max) {
    const location = response.headers.get("location");
    if (!location) break;
    current = new URL(location, current).toString();
    response = await fetchWithCookies(current, jar, { method: "GET" });
    hops += 1;
  }
  return { response, url: current };
}

function extractNonce(html: string) {
  const match = html.match(/name="woocommerce-login-nonce"\s+value="([^"]+)"/i);
  return match?.[1] ?? null;
}

function parsePercent(htmlOrText: string | null | undefined) {
  if (!htmlOrText) return 0;
  const match = String(htmlOrText).match(/(\d{1,3})\s*%/);
  if (!match) return 0;
  return Math.max(0, Math.min(100, Number(match[1])));
}

async function login(jar: CookieJar) {
  const email = packProEmail();
  const password = packProPassword();
  if (!email || !password) {
    throw new Error("PACK_PRO_EMAIL and PACK_PRO_PASSWORD are required.");
  }

  const base = packProBaseUrl();
  const accountUrl = `${base}/my-account/`;
  const { response: loginPage } = await followRedirects(accountUrl, jar);
  const loginHtml = await loginPage.text();
  const nonce = extractNonce(loginHtml);
  if (!nonce) {
    throw new Error("Pack Pro login form nonce not found.");
  }

  const body = new URLSearchParams({
    username: email,
    password,
    "woocommerce-login-nonce": nonce,
    _wp_http_referer: "/my-account/",
    login: "Log in",
    rememberme: "forever"
  });

  const { response, url } = await followRedirects(accountUrl, jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const html = await response.text();
  const loggedIn =
    jar.has("wordpress_logged_in_5e482e41664cefceef06a1e3bccc62cd") ||
    [...jar.keys()].some((key) => key.startsWith("wordpress_logged_in_")) ||
    /customer-logout|woocommerce-MyAccount-navigation|Facility Dashboard|groups-dashboard/i.test(html) ||
    /groups-dashboard|reporting-dashboard/i.test(url);

  if (!loggedIn) {
    throw new Error("Pack Pro login failed. Check PACK_PRO_EMAIL / PACK_PRO_PASSWORD.");
  }
}

async function postAjax<T>(jar: CookieJar, fields: Record<string, string>): Promise<T> {
  const base = packProBaseUrl();
  const body = new URLSearchParams(fields);
  const response = await fetchWithCookies(`${base}/wp-admin/admin-ajax.php`, jar, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    throw new Error(`Pack Pro AJAX failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

type ReportRow = {
  name?: string;
  email_id?: string;
  course_progress?: string;
};

type ReportPayload = {
  data?: ReportRow[];
  recordsTotal?: number;
};

export async function fetchPackProTrainingProgress(): Promise<{
  groupId: number;
  learners: PackProRawLearnerProgress[];
}> {
  const jar: CookieJar = new Map();
  await login(jar);

  const groupId = packProGroupId();
  await postAjax(jar, {
    action: "wdm_lgdr_create_report_table",
    group_id: String(groupId)
  });

  const byEmail = new Map<string, PackProRawLearnerProgress>();

  for (const course of PACK_PRO_REQUIRED_COURSES) {
    const payload = await postAjax<ReportPayload>(jar, {
      action: "wdm_display_ldgr_group_report",
      course_id: String(course.id),
      group_id: String(groupId),
      show_rewards: "",
      length: "-1",
      start: "0",
      draw: "1"
    });

    for (const row of payload.data ?? []) {
      const email = String(row.email_id ?? "")
        .trim()
        .toLowerCase();
      const name = String(row.name ?? "").trim() || email;
      if (!email) continue;
      const percent = parsePercent(row.course_progress);
      const existing = byEmail.get(email) ?? { name, email, courses: [] };
      existing.name = name || existing.name;
      existing.courses = existing.courses.filter((item) => item.course_id !== course.id);
      existing.courses.push({
        course_id: course.id,
        course_title: course.title,
        percent
      });
      byEmail.set(email, existing);
    }
  }

  const learners = [...byEmail.values()]
    .map((learner) => ({
      ...learner,
      courses: PACK_PRO_REQUIRED_COURSES.map((course) => {
        const found = learner.courses.find((item) => item.course_id === course.id);
        return {
          course_id: course.id,
          course_title: course.title,
          percent: found?.percent ?? 0
        };
      })
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { groupId, learners };
}
