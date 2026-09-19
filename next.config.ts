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

const nextConfig: NextConfig = {
  // Modo dev: libera requisicoes vindas por IP (LAN/Tailscale) e nomes .local,
  // senao o Next.js bloqueia os assets de desenvolvimento (HMR).
  allowedDevOrigins: getAllowedDevOrigins(),
};

export default nextConfig;