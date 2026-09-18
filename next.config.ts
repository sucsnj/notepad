import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 e um modulo nativo: mantenha-o fora do bundle do servidor.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
