import type { NextRequest } from "next/server";
import { parseId, readJson, stringField } from "@/lib/http";
import { deleteNote, getNote, updateNote } from "@/lib/notes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const id = parseId((await context.params).id);
  if (id === null) {
    return Response.json({ error: "Identificador inválido" }, { status: 400 });
  }

  const note = getNote(id);
  if (!note) {
    return Response.json({ error: "Anotação não encontrada" }, { status: 404 });
  }

  return Response.json({ note });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const id = parseId((await context.params).id);
  if (id === null) {
    return Response.json({ error: "Identificador inválido" }, { status: 400 });
  }

  const body = await readJson(request);

  const note = updateNote(id, {
    title: stringField(body.title),
    content: stringField(body.content),
    textContent: stringField(body.textContent),
  });

  if (!note) {
    return Response.json({ error: "Anotação não encontrada" }, { status: 404 });
  }

  return Response.json({ note });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const id = parseId((await context.params).id);
  if (id === null) {
    return Response.json({ error: "Identificador inválido" }, { status: 400 });
  }

  const deleted = deleteNote(id);
  if (!deleted) {
    return Response.json({ error: "Anotação não encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
