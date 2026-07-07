import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function loadEnvFiles(cwd = process.cwd()) {
  loadEnvFile(resolve(cwd, ".env.local"));
  loadEnvFile(resolve(cwd, ".env"));
}

export function requireDatabasePassword() {
  loadEnvFiles();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) {
    throw new Error("Missing SUPABASE_DB_PASSWORD in .env.local");
  }
  return password;
}
