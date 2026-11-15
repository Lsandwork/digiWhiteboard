import assert from "node:assert/strict";
import {
  getSupabaseServerConfigSummary,
  resolveSupabaseProjectUrl,
  tryGetServiceSupabase
} from "../lib/supabase/server";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prior[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(vars)) {
      const next = prior[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    }
  }
}

withEnv(
  {
    NEXT_PUBLIC_SUPABASE_URL: "tzkocaucqtmmnrttxira.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"
  },
  () => {
    assert.equal(resolveSupabaseProjectUrl(), "https://tzkocaucqtmmnrttxira.supabase.co");
    assert.ok(tryGetServiceSupabase({ timeoutMs: 0 }));
    const summary = getSupabaseServerConfigSummary();
    assert.equal(summary.urlHost, "tzkocaucqtmmnrttxira.supabase.co");
    assert.equal(summary.hasProjectUrl, true);
    assert.equal(summary.hasServiceRoleKey, true);
  }
);

withEnv(
  {
    NEXT_PUBLIC_SUPABASE_URL: "PASTE_SUPABASE_PROJECT_URL_HERE",
    SUPABASE_URL: "https://fallback.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "key"
  },
  () => {
    assert.equal(resolveSupabaseProjectUrl(), "https://fallback.supabase.co");
  }
);

withEnv(
  {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined
  },
  () => {
    assert.equal(resolveSupabaseProjectUrl(), undefined);
    assert.equal(tryGetServiceSupabase(), null);
    const summary = getSupabaseServerConfigSummary();
    assert.equal(summary.hasProjectUrl, false);
    assert.equal(summary.hasServiceRoleKey, false);
  }
);

console.log("supabase server config tests passed");