// Lightweight in-memory store for the post-session Jordan note.
// Written by WorkoutCompleteScreen after coaching-feedback returns.
// Read by HomeScreen on next focus to display immediately.
// Cleared after HomeScreen reads it once.

let pendingNote: string | null = null;

export function setPendingJordanNote(note: string): void {
  pendingNote = note;
}

export function consumePendingJordanNote(): string | null {
  const note = pendingNote;
  pendingNote = null;
  return note;
}
