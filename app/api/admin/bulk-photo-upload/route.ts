import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { accessFromLegacyRole, hasPermission } from "@/lib/admin/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per photo
const MAX_FILES = 20;

function normalizeAnimalId(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);
  if (!hasPermission(access, "view_admin_panel")) {
    return NextResponse.json({ error: "You do not have permission to upload dog photos." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "Select at least one image." }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Limit is ${MAX_FILES} files per upload.` }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const results: Array<{ animalId: string; fileName: string; updated: boolean; error?: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!;
      const animalId = normalizeAnimalId(form.get(`animal_id_${index}`));

      if (!animalId) {
        results.push({ animalId: "", fileName: file.name, updated: false, error: "Missing animal ID." });
        continue;
      }
      if (!file.type.startsWith("image/")) {
        results.push({ animalId, fileName: file.name, updated: false, error: "File must be an image." });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        results.push({ animalId, fileName: file.name, updated: false, error: "Image exceeds 2 MB limit." });
        continue;
      }

      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;
      const { error } = await supabase
        .from("live_transition_dogs")
        .update({ photo_url: dataUrl, updated_at: new Date().toISOString() })
        .eq("gingr_animal_id", animalId);

      if (error) {
        results.push({ animalId, fileName: file.name, updated: false, error: error.message });
      } else {
        results.push({ animalId, fileName: file.name, updated: true });
      }
    }

    return NextResponse.json({
      ok: true,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload photos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

