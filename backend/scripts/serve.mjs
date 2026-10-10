import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readEnv(key) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return undefined;

  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    return line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

const nodeVersion = process.versions.node;
const [nodeMajor, nodeMinor] = nodeVersion.split(".").map(Number);

// node:sqlite existe a partir do Node 22.5.
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  console.error(
    `[serve.mjs] O backend usa o modulo nativo node:sqlite, disponivel apenas no Node >= 22.5.\n` +
      `Node atual: v${nodeVersion}. Instale uma versao mais recente e tente novamente.`,
  );
  process.exit(1);
}

const mode = process.argv[2] === "start" ? "start" : "dev";

// node:sqlite exigia --experimental-sqlite ate o Node 22.12. Injeta enquanto Node < 23.
const runtimeFlags = nodeMajor < 23 ? ["--experimental-sqlite"] : [];
const envFlags = fs.existsSync(path.join(root, ".env")) ? ["--env-file", ".env"] : [];
const watchFlags = mode === "dev" ? ["--watch"] : [];

const entry = path.join(root, "src", "server.ts");
const port = process.env.PORT || readEnv("PORT") || "3010";

const args = [
  ...envFlags,
  ...runtimeFlags,
  ...watchFlags,
  "--import",
  "tsx",
  entry,
];

console.log(`\n> backend ${mode} - porta ${port}\n`);

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  cwd: root,
});
child.on("exit", (code) => process.exit(code ?? 0));
