import { cacheNote, deleteCachedNote, setIdMapping } from "./notesStore";
import { getPendingOps, removeOpsForNote } from "./outbox";
import type { Note } from "@/lib/types";

export interface FlushResult {
  processed: number;
  remaining: number;
  reconciled: Map<number, number>;
  failed: boolean;
}

let running: Promise<FlushResult> | null = null;

// Drena a fila de operações assim que possível. Chamadas concorrentes
// compartilham a mesma execução (não roda em paralelo).
export function flushOutbox(): Promise<FlushResult> {
  if (!running) {
    running = runFlush().finally(() => {
      running = null;
    });
  }
  return running;
}

function sendJson(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

async function runFlush(): Promise<FlushResult> {
  const reconciled = new Map<number, number>();
  let processed = 0;
  let failed = false;

  const ops = (await getPendingOps()).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );

  for (const op of ops) {
    try {
      if (op.kind === "create") {
        const response = await sendJson("/api/notes", "POST", {
          title: op.title ?? "",
          content: op.content ?? "",
        });
        if (!response.ok) {
          failed = response.status >= 500;
          break;
        }
        const data = (await response.json()) as { note: Note };
        await deleteCachedNote(op.noteId);
        await cacheNote(data.note);
        await setIdMapping(op.noteId, data.note.id);
        await removeOpsForNote(op.noteId);
        reconciled.set(op.noteId, data.note.id);
        processed++;
      } else if (op.kind === "update") {
        const response = await sendJson(`/api/notes/${op.noteId}`, "PATCH", {
          title: op.title ?? "",
          content: op.content ?? "",
        });
        if (response.status === 404) {
          // A nota não existe mais no servidor: descarta a operação.
          await removeOpsForNote(op.noteId);
          processed++;
          continue;
        }
        if (!response.ok) {
          failed = response.status >= 500;
          break;
        }
        const data = (await response.json()) as { note: Note };
        await cacheNote(data.note);
        await removeOpsForNote(op.noteId);
        processed++;
      } else {
        const response = await sendJson(`/api/notes/${op.noteId}`, "DELETE");
        if (!response.ok && response.status !== 404) {
          failed = response.status >= 500;
          break;
        }
        await removeOpsForNote(op.noteId);
        processed++;
      }
    } catch {
      // Erro de rede: interrompe e tenta de novo depois.
      failed = true;
      break;
    }
  }

  const remaining = (await getPendingOps()).length;
  return { processed, remaining, reconciled, failed };
}
