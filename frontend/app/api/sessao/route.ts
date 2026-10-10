import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, COOKIE_NAME, passwordEnabled, sessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function cookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function POST(request: NextRequest) {
  if (!passwordEnabled()) {
    return NextResponse.json({ ok: true });
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Requisicao invalida" }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, await sessionToken(), cookieOptions(request));
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { ...cookieOptions(request), maxAge: 0 });
  return response;
}