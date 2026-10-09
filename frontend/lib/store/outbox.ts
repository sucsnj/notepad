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
// Operações de anexo ("upload"/"detach") são independentes entre si e nunca são
// absorvidas por "create"/"update".
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
  } else if (op.kind === "upload") {
    // Um "detach" do mesmo anexo cancela o upload pendente.
    for (const item of related) {
      if (item.kind === "detach" && item.attachmentId === op.attachmentId) {
        await store.delete(item.id);
      }
    }
    await store.put({ ...op, id: newId() });
  } else if (op.kind === "detach") {
    for (const item of related) {
      if (
        (item.kind === "upload" || item.kind === "detach") &&
        item.attachmentId === op.attachmentId
      ) {
        await store.delete(item.id);
      }
    }
    await store.put({ ...op, id: newId() });
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
// Operações de anexo não entram no mapa diretamente: se a nota só tem anexo
// pendente, ela é tratada como "update" (a cópia local é a mais recente).
export async function pendingKinds(): Promise<Map<number, OutboxKind>> {
  const ops = await getPendingOps();
  const map = new Map<number, OutboxKind>();

  for (const op of ops) {
    if (op.kind === "upload" || op.kind === "detach") continue;
    if (map.get(op.noteId) === "delete") continue;
    map.set(op.noteId, op.kind);
  }

  for (const op of ops) {
    if (op.kind !== "upload" && op.kind !== "detach") continue;
    if (!map.has(op.noteId)) map.set(op.noteId, "update");
  }

  return map;
}

export async function pendingOpsForNote(noteId: number): Promise<OutboxOp[]> {
  const ops = await getPendingOps();
  return ops.filter((item) => item.noteId === noteId);
}

export async function removeOpForAttachment(
  noteId: number,
  attachmentId: number,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");

  for (const item of await tx.store.getAll()) {
    if (
      item.noteId === noteId &&
      (item.kind === "upload" || item.kind === "detach") &&
      item.attachmentId === attachmentId
    ) {
      await tx.store.delete(item.id);
    }
  }

  await tx.done;
}

// Move as operações de uma nota temporária para o id real depois que o
// "create" é sincronizado (preserve anexos ainda não enviados).
export async function remapOps(
  fromId: number,
  toId: number,
  createOpId: string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");

  for (const item of await tx.store.getAll()) {
    if (item.noteId !== fromId) continue;
    if (item.id === createOpId) {
      await tx.store.delete(item.id);
    } else {
      await tx.store.put({ ...item, noteId: toId });
    }
  }

  await tx.done;
}

// Reescreve o conteúdo de uma operação pendente da nota (troca URLs locais
// pelas definitivas após o upload).
export async function replaceOpContent(
  noteId: number,
  replace: (content: string) => string,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");

  for (const item of await tx.store.getAll()) {
    if (item.noteId !== noteId) continue;
    if (item.kind !== "create" && item.kind !== "update") continue;
    if (item.content === undefined) continue;
    const content = replace(item.content);
    if (content !== item.content) {
      await tx.store.put({ ...item, content });
    }
  }

  await tx.done;
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

// Remove apenas as operações de conteúdo da nota (create/update), preservando
// anexos ainda não enviados.
export async function removeNoteOps(noteId: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("outbox", "readwrite");

  for (const item of await tx.store.getAll()) {
    if (item.noteId !== noteId) continue;
    if (item.kind === "create" || item.kind === "update") {
      await tx.store.delete(item.id);
    }
  }

  await tx.done;
}

export async function outboxSize(): Promise<number> {
  const db = await getDB();
  return db.count("outbox");
}
