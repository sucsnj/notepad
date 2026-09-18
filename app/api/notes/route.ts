import type { NextRequest } from "next/server";
import { readJson, stringField } from "@/lib/http";
import { createNote, listNotes } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return Response.json({ notes: listNotes(query) });
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);

  const note = createNote({
    title: stringField(body.title),
    content: stringField(body.content),
    textContent: stringField(body.textContent),
  });

  return Response.json({ note }, { status: 201 });
}
