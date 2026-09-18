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

const mode = process.argv[2] === "start" ? "start" : "dev";
const port = process.env.PORT || readEnvPort() || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = [nextBin, mode, "-H", hostname, "-p", String(port)];

console.log(`\n> next ${mode} -H ${hostname} -p ${port}\n`);

const child = spawn(process.execPath, args, { stdio: "inherit", cwd: root });
child.on("exit", (code) => process.exit(code ?? 0));
