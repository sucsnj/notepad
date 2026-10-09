import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readEnvPort() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return undefined;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key !== "PORT") continue;
    return line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

const nodeVersion = process.versions.node;
const [nodeMajor, nodeMinor] = nodeVersion.split(".").map(Number);

// node:sqlite so existe a partir do Node 22.5.
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error(
    `[serve.mjs] O projeto usa o modulo nativo node:sqlite, disponivel apenas no Node >= 22.5.\n` +
      `Node atual: v${nodeVersion}. Instale uma versao mais recente (ex.: via nvm/nvm4w) e tente novamente.`,
  );
  process.exit(1);
}

const modeArg = process.argv[2];
const mode = modeArg === "start" ? "start" : modeArg === "build" ? "build" : "dev";

// node:sqlite exigia o flag --experimental-sqlite ate o Node 22.12 (desbloqueado em 22.13/23.4).
// Injeta enquanto o Node < 23 para funcionar igual em qualquer maquina.
const runtimeFlags =
  nodeMajor < 23 ? ["--experimental-sqlite"] : [];

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

let args;
let label;
if (mode === "build") {
  args = [...runtimeFlags, nextBin, "build"];
  label = "next build";
} else {
  const port = process.env.PORT || readEnvPort() || "3000";
  const hostname = process.env.HOSTNAME || "0.0.0.0";
  args = [...runtimeFlags, nextBin, mode, "-H", hostname, "-p", String(port)];
  label = `next ${mode} -H ${hostname} -p ${port}`;
}

console.log(`\n> ${label}\n`);

const child = spawn(process.execPath, args, { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code ?? 0));