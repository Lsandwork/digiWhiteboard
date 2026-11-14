import { handleLeadershipGet, handleLeadershipPost } from "@/lib/team-engagement/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleLeadershipGet(request);
}

export function POST(request: Request) {
  return handleLeadershipPost(request);
}
