import { proxyToBackend } from "@/lib/proxy";

// URLs legadas de anexos (/uploads/...) apontam para o mesmo handler do backend.
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

async function handler(request: Request, context: Context): Promise<Response> {
  const { slug = [] } = await context.params;
  return proxyToBackend(request, ["uploads", ...slug]);
}

export const GET = handler;