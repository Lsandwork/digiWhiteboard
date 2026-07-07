import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  return NextResponse.json(
    {
      error:
        "Direct server upload is disabled. Reload the page and upload again so the browser can send the file directly to storage."
    },
    { status: 410 }
  );
}
