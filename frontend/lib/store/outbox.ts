import { getDB, type OutboxKind, type OutboxOp } from "./db";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Grava uma operação na fila. Operações sobre a mesma nota são fundidas para
// evitar requisições redundantes: um "create" absorve os "update" seguintes;
// um "delete" descarta o que houver e passa a ser a única operação pendente.
export async function enqueue(op: Omit<OutboxOp, "id">): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.store;
  const all = await store.getAll();
  const related = all.filter((item) => item.noteId === op.noteId);

  if (op.kind === "create") {
    await store.put({ ...op, id: newId() });
  } else if (op.kind === "update") {
    const create = related.find((item) => item.kind === "create");
    const update = related.find((item) => item.kind === "update");

    if (create) {
      await store.put({ ...create, title: op.title, content: op.content });
    } else if (update) {
      await store.put({
        ...update,
        title: op.title,
        content: op.content,
        createdAt: op.createdAt,
      });
    } else {
      await store.put({ ...op, id: newId() });
    }
  } else {
    for (const item of related) {
      await store.delete(item.id);
    }
    await store.put({ ...op, id: newId() });
  }

  await tx.done;
}

export async function getPendingOps(): Promise<OutboxOp[]> {
  const db = await getDB();
  return db.getAll("outbox");
}

// Mapa noteId -> tipo de operação pendente (delete tem prioridade).
export async function pendingKinds(): Promise<Map<number, OutboxKind>> {
  const ops = await getPendingOps();
  const map = new Map<number, OutboxKind>();

  for (const op of ops) {
    if (map.get(op.noteId) === "delete") continue;
    map.set(op.noteId, op.kind);
  }

  return map;
}

export async function removeOpsForNote(noteId: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");
  const all = await tx.store.getAll();

  for (const item of all) {
    if (item.noteId === noteId) {
      await tx.store.delete(item.id);
    }
  }

  await tx.done;
}

export async function outboxSize(): Promise<number> {
  const db = await getDB();
  return db.count("outbox");
}
