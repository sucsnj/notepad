import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isValidSession, passwordEnabled } from "@/lib/session";

// Protege a aplicacao com a senha de APP_PASSWORD. Sem APP_PASSWORD definida,
// todas as requisicoes passam (uso local).
export async function proxy(request: NextRequest) {
  if (!passwordEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const authorized = await isValidSession(request.cookies.get(COOKIE_NAME)?.value);

  if (authorized) return NextResponse.next();

  // Chamadas de dados recebem 401; paginas vao para a tela de login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const target = new URL("/entrar", request.url);
  if (pathname !== "/") target.searchParams.set("origem", pathname);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: [
    "/((?!entrar|api/sessao|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};