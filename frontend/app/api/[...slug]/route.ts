import { proxyToBackend } from "@/lib/proxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

async function handler(request: Request, context: Context): Promise<Response> {
  const { slug = [] } = await context.params;
  // A rota é /api/[...slug]: o prefixo /api volta no destino.
  return proxyToBackend(request, ["api", ...slug]);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;