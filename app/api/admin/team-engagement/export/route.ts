import { handleExport } from "@/lib/team-engagement/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleExport(request);
}
