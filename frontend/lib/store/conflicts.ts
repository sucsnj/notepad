import { getDB, type ConflictRecord } from "./db";

export async function listConflicts(): Promise<ConflictRecord[]> {
  const db = await getDB();
  return db.getAll("conflicts");
}

export async function getConflict(
  noteId: number,
): Promise<ConflictRecord | undefined> {
  const db = await getDB();
  return db.get("conflicts", noteId);
}

export async function putConflict(record: ConflictRecord): Promise<void> {
  const db = await getDB();
  await db.put("conflicts", record);
}

export async function removeConflict(noteId: number): Promise<void> {
  const db = await getDB();
  await db.delete("conflicts", noteId);
}

export async function conflictIds(): Promise<Set<number>> {
  const db = await getDB();
  const keys = await db.getAllKeys("conflicts");
  return new Set(keys);
}
