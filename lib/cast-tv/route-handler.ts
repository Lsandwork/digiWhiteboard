import { blockDemoWrite } from "@/lib/admin/api-auth";
import { requireCastTvManager, type CastTvManager } from "@/lib/cast-tv/api-auth";
import { castTvErrorResponse } from "@/lib/cast-tv/errors";

export async function handleCastTvWrite(
  request: Request,
  handler: (auth: CastTvManager) => Promise<Response>,
  fallback = "CAST-TV request failed."
) {
  try {
    const demoBlock = blockDemoWrite(request);
    if (demoBlock) return demoBlock;

    const auth = await requireCastTvManager(request);
    if ("error" in auth) return auth.error;

    return await handler(auth);
  } catch (error) {
    const response = castTvErrorResponse(error, fallback);
    if (response.status >= 500) {
      console.error("[cast-tv]", fallback, error);
    }
    return response;
  }
}
