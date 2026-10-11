import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, isValidSession } from "@/lib/session";

// A senha (APP_PASSWORD) e sempre exigida. Sem ela configurada, ninguem consegue
// entrar: nenhuma sessao e valida e o app fica inacessivel (falha fechada).
export async function proxy(request: NextRequest) {
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