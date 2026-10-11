// Liveness do proprio frontend: nao depende do backend nem de autenticacao
// (usado pelo HEALTHCHECK do container).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}