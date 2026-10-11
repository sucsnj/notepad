import { timingSafeEqual } from "node:crypto";

// Token compartilhado entre o backend e o proxy do frontend. A autenticacao e
// sempre exigida: sem API_TOKEN a API nao libera nenhuma rota (falha fechada).
const token = (process.env.API_TOKEN ?? "").trim();

export const authConfigured = token.length > 0;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function isAuthorized(header: string | undefined): boolean {
  if (!authConfigured) return false;
  const provided = extractBearer(header);
  return provided !== null && safeEqual(provided, token);
}