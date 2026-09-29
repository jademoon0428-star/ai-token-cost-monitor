import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = join(root, ".next", "standalone");
const serverEntry = join(standaloneDir, "server.js");

const staticSrc = join(root, ".next", "static");
const staticDst = join(standaloneDir, ".next", "static");
const publicSrc = join(root, "public");
const publicDst = join(standaloneDir, "public");

if (!existsSync(serverEntry)) {
  throw new Error(
    "standalone build not found at .next/standalone/server.js - run `npm run build` first"
  );
}

// Next.js `output: "standalone"` does not copy client assets. Without them the
// server returns 404 for every /_next/static request, the page never hydrates,
// and client components stay on their loading placeholder forever.
function ensureStandaloneAsset(source, target, label, required) {
  if (!existsSync(source)) {
    if (required) {
      throw new Error(
        `standalone ${label} not found at ${source} - run \`npm run build\` first`
      );
    }
    return;
  }
  if (existsSync(target)) {
    return;
  }
  cpSync(source, target, { recursive: true });
  console.log(
    `[ai-token-cost-monitor] standalone ${label} copied -> ${target}`
  );
}

ensureStandaloneAsset(staticSrc, staticDst, "static assets", true);
ensureStandaloneAsset(publicSrc, publicDst, "public assets", false);

const hostname = process.env.HOSTNAME || "127.0.0.1";
process.env.HOSTNAME = hostname;

const configuredPort = Number.parseInt(process.env.PORT ?? "", 10);

if (Number.isInteger(configuredPort) && configuredPort > 0) {
  process.env.PORT = String(configuredPort);
} else {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
  process.env.PORT = String(port);
}

console.log(
  `[ai-token-cost-monitor] production http://${hostname}:${process.env.PORT}`
);

const child = spawn(process.execPath, [serverEntry], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});