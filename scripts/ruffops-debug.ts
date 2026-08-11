#!/usr/bin/env tsx
/**
 * RuffOps Cursor Debug Bridge CLI
 *
 * Examples:
 *   npm run ruffops:debug -- health
 *   npm run ruffops:debug -- route-run RG-20260812-00172
 *   npm run ruffops:debug -- dog Baxter --date 2026-08-12
 *   npm run ruffops:debug -- errors --last 1h
 *   npm run ruffops:debug -- integration samsara --last 24h
 *   npm run ruffops:debug -- search "Captain"
 *   npm run ruffops:debug -- context --feature route-generator --last 24h
 *   npm run ruffops:debug -- bug RG-20260812-00172
 *
 * Uses local Supabase service credentials from env (same as other scripts).
 * Never prints secrets. Production requires RUFFOPS_DEBUG_ALLOW_PRODUCTION=true
 * or settings.productionDiagnosticAccess.
 */

import {
  debugHealth,
  debugRouteRun,
  debugDog,
  debugErrors,
  debugIntegration,
  debugSearch,
  debugFeatureContext,
  debugBugBundle,
  formatDebugContextText
} from "../lib/system-health/debug-bridge";

function argValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function parseLastHours(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const m = String(raw).trim().match(/^(\d+)\s*h$/i);
  if (m) return Number(m[1]);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function wantJson(args: string[]) {
  return args.includes("--json");
}

function print(data: unknown, asJson: boolean) {
  if (asJson || typeof data !== "string") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${data}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const asJson = wantJson(args);

  if (!cmd || cmd === "--help" || cmd === "help") {
    print(
      {
        usage: [
          "npm run ruffops:debug -- health [--json]",
          "npm run ruffops:debug -- route-run <RG-...> [--json]",
          "npm run ruffops:debug -- dog <name> [--date YYYY-MM-DD] [--json]",
          "npm run ruffops:debug -- errors [--last 1h] [--json]",
          "npm run ruffops:debug -- integration <name> [--last 24h] [--json]",
          "npm run ruffops:debug -- search <query> [--json]",
          "npm run ruffops:debug -- context --feature route-generator [--last 24h] [--json]",
          "npm run ruffops:debug -- bug <RG-...> [--json]"
        ]
      },
      true
    );
    return;
  }

  const actor = {
    adminId: null,
    email: process.env.RUFFOPS_DEBUG_ACTOR_EMAIL || "cli@local"
  };

  switch (cmd) {
    case "health":
      print(await debugHealth(actor), true);
      break;
    case "route-run":
      print(await debugRouteRun(String(args[1] || ""), actor), true);
      break;
    case "dog": {
      const dog = String(args[1] || "");
      const date = argValue(args, "--date");
      print(await debugDog({ dog, date, actor }), true);
      break;
    }
    case "errors":
      print(
        await debugErrors({
          lastHours: parseLastHours(argValue(args, "--last"), 1),
          actor
        }),
        true
      );
      break;
    case "integration":
      print(
        await debugIntegration({
          integration: String(args[1] || ""),
          lastHours: parseLastHours(argValue(args, "--last"), 24),
          actor
        }),
        true
      );
      break;
    case "search":
      print(await debugSearch({ query: String(args[1] || ""), actor }), true);
      break;
    case "context": {
      const feature = argValue(args, "--feature") || "route-generator";
      print(
        await debugFeatureContext({
          feature,
          lastHours: parseLastHours(argValue(args, "--last"), 24),
          actor
        }),
        true
      );
      break;
    }
    case "bug": {
      const bundle = (await debugBugBundle(String(args[1] || ""), actor)) as Record<string, unknown>;
      if (asJson) print(bundle, true);
      else print(formatDebugContextText(bundle), false);
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
