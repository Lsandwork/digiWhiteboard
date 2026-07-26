import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

async function main() {
  const patch = JSON.parse(process.argv[2] || "{}") as Record<string, unknown>;
  const password = process.env.SUPABASE_DB_PASSWORD!;
  const client = new Client({
    connectionString: `postgresql://postgres.tzkocaucqtmmnrttxira:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const { rows } = await client.query(`select value from route_generator_settings where key='feature_checklist'`);
  const next = { ...(rows[0]?.value as object), ...patch, updated_at: new Date().toISOString() };
  await client.query(`update route_generator_settings set value=$1::jsonb, updated_at=now() where key='feature_checklist'`, [
    JSON.stringify(next)
  ]);
  console.log(JSON.stringify(next, null, 2));
  await client.end();
}

void main();
