const COOKIE_NAME = "notepad_session";

// Comparacao em tempo constante (evita vazar a senha por tempo de resposta).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Sem APP_PASSWORD nao existe login: o app fica inacessivel (falha fechada).
export function appPassword(): string {
  return (process.env.APP_PASSWORD ?? "").trim();
}

export function passwordConfigured(): boolean {
  return appPassword().length > 0;
}

export function checkPassword(candidate: string): boolean {
  const expected = appPassword();
  return expected.length > 0 && safeEqual(candidate, expected);
}

// Token do cookie derivado da senha: nao guarda a senha em si.
export async function sessionToken(): Promise<string> {
  return sha256(`notepad:${appPassword()}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!passwordConfigured()) return false;
  if (!token) return false;
  return safeEqual(token, await sessionToken());
}

export { COOKIE_NAME };