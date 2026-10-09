import type { NextConfig } from "next";

const defaultAllowedDevOrigins = ["*.*.*.*", "**.local"];

function getAllowedDevOrigins(): string[] {
  const raw = process.env.ALLOWED_DEV_ORIGINS;
  if (!raw) return defaultAllowedDevOrigins;

  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return list.length > 0 ? list : defaultAllowedDevOrigins;
}

// URL do backend standalone (Fastify). O frontend faz proxy de /api e /uploads
// para ele, mantendo as chamadas do cliente em mesma origem (sem CORS).
const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  // Modo dev: libera requisicoes vindas por IP (LAN/Tailscale) e nomes .local,
  // senao o Next.js bloqueia os assets de desenvolvimento (HMR).
  allowedDevOrigins: getAllowedDevOrigins(),
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backendUrl}/uploads/:path*` },
    ];
  },
};

export default nextConfig;