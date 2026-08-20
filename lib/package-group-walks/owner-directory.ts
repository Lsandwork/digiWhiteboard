/**
 * Server-side Gingr /owners directory for CSV owner resolution.
 * Never serialize the directory to the browser.
 */
import { loadGingrOwnersListRead } from "./gingr-packages";
import { gingrRowsFromPayload } from "./gingr-v1";
import {
  directoryByNormalizedFullName,
  gingrOwnerFromRecord,
  inspectOwnerRecordSchema,
  normalizeOwnerName,
  publicOwnerCandidate,
  type InternalResolvedGingrOwner
} from "./csv-owner-resolution";

export type GingrOwnerDirectory = {
  httpStatus: number | null;
  owners: InternalResolvedGingrOwner[];
  byId: Map<string, InternalResolvedGingrOwner>;
  byFullName: Map<string, InternalResolvedGingrOwner[]>;
  error: string | null;
};

export async function loadGingrOwnerDirectory(): Promise<GingrOwnerDirectory> {
  const read = await loadGingrOwnersListRead();
  if (!read.ok) {
    return {
      httpStatus: read.status,
      owners: [],
      byId: new Map(),
      byFullName: new Map(),
      error: read.error ?? "Gingr owners list failed."
    };
  }

  const rows = gingrRowsFromPayload(read.payload);
  const sample = rows.find((row) => row && Object.keys(row).length > 0) ?? null;
  const schema = inspectOwnerRecordSchema(sample, rows);
  const owners = rows
    .map((row) => gingrOwnerFromRecord(row, schema))
    .filter((row): row is InternalResolvedGingrOwner => Boolean(row));
  const byId = new Map<string, InternalResolvedGingrOwner>();
  for (const owner of owners) byId.set(owner.gingrOwnerId, owner);

  return {
    httpStatus: read.status,
    owners,
    byId,
    byFullName: directoryByNormalizedFullName(owners),
    error: null
  };
}

/** Admin search — exact-name candidates first, then prefix matches. Never dumps the directory. */
export function searchOwnerDirectory(
  directory: GingrOwnerDirectory,
  query: string,
  limit = 25
): Array<ReturnType<typeof publicOwnerCandidate>> {
  const normalized = normalizeOwnerName(query);
  if (!normalized) return [];

  const exact = directory.byFullName.get(normalized) ?? [];
  const seen = new Set<string>();
  const matches: InternalResolvedGingrOwner[] = [];
  for (const owner of exact) {
    if (!owner.active || seen.has(owner.gingrOwnerId)) continue;
    seen.add(owner.gingrOwnerId);
    matches.push(owner);
  }
  if (matches.length < limit) {
    for (const owner of directory.owners) {
      if (!owner.active || seen.has(owner.gingrOwnerId)) continue;
      if (
        owner.normalizedFullName.startsWith(normalized) ||
        owner.normalizedFullName.includes(` ${normalized}`) ||
        owner.normalizedLastName === normalized
      ) {
        seen.add(owner.gingrOwnerId);
        matches.push(owner);
        if (matches.length >= limit) break;
      }
    }
  }
  return matches.slice(0, limit).map(publicOwnerCandidate);
}

export function publicCandidatesForName(
  directory: GingrOwnerDirectory,
  normalizedOwnerName: string
): Array<ReturnType<typeof publicOwnerCandidate>> {
  const matches = (directory.byFullName.get(normalizedOwnerName) ?? []).filter((owner) => owner.active);
  return matches.map(publicOwnerCandidate);
}
