import { handleParticipantGet, handleParticipantPost } from "@/lib/team-engagement/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleParticipantGet(request);
}

export function POST(request: Request) {
  return handleParticipantPost(request);
}
