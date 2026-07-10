import { WALK_BOARD_MAX_NAME_LENGTH } from "./constants";
import { WALK_BOARD_TYPES, type WalkBoardType } from "./types";

export function normalizeWalkBoardDogName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function validateWalkBoardDogName(name: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { ok: false, error: "Enter a dog name." };
  }
  if (trimmed.length > WALK_BOARD_MAX_NAME_LENGTH) {
    return { ok: false, error: `Dog name must be ${WALK_BOARD_MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: trimmed };
}

export function parseWalkBoardType(value: unknown): WalkBoardType | null {
  const raw = String(value ?? "").trim();
  return (WALK_BOARD_TYPES as readonly string[]).includes(raw) ? (raw as WalkBoardType) : null;
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}
