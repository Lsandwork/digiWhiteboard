export function splitMedicationDisplayNotes(row: {
  instructions?: string | null;
  notes?: string | null;
}): { instructions: string | null; notes: string | null } {
  const instructions = String(row.instructions || "").trim() || null;
  const notes = String(row.notes || "").trim() || null;
  if (!notes) return { instructions, notes: null };
  if (instructions && notes.toLowerCase() === instructions.toLowerCase()) {
    return { instructions, notes: null };
  }
  return { instructions, notes };
}
