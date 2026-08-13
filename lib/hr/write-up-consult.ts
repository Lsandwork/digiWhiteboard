import { inferHrWriteUpUploadContentType } from "@/lib/hr/upload-write-up";
import { isUploadedHrWriteUp } from "@/lib/hr/write-up-consult-copy";
import { getWriteUpPdfBytes } from "@/lib/staff/write-up-pdf-store";

export { isUploadedHrWriteUp, UPLOADED_WRITE_UP_SCAN_PROMPT } from "@/lib/hr/write-up-consult-copy";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type HrConsultWriteUpAttachment = {
  filename: string;
  mimeType: string;
  base64: string;
};

export async function loadHrConsultWriteUpAttachment(
  supabase: SupabaseClient,
  reportId: string
): Promise<HrConsultWriteUpAttachment | null> {
  const file = await getWriteUpPdfBytes(supabase, reportId);
  if (!file?.bytes?.length) return null;
  const mimeType =
    inferHrWriteUpUploadContentType(file.filename, file.content_type) || file.content_type || "application/pdf";
  return {
    filename: file.filename,
    mimeType,
    base64: Buffer.from(file.bytes).toString("base64")
  };
}
