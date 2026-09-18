import type { NextRequest } from "next/server";
import { parseId } from "@/lib/http";
import { saveUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let form: FormData;

  try {
    form = await request.formData();
  } catch (error) {
    console.error("Falha ao processar o corpo do upload", error);
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const noteId = parseId(String(form.get("noteId") ?? ""));
  if (noteId === null) {
    return Response.json({ error: "noteId inválido" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Nenhum arquivo foi enviado" }, { status: 400 });
  }

  try {
    const attachment = await saveUpload(noteId, file);
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Falha no upload", error);
    return Response.json({ error: "Falha ao salvar o arquivo" }, { status: 500 });
  }
}
