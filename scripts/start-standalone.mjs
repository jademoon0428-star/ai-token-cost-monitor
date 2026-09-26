import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, ".next", "standalone", "server.js");

if (!existsSync(serverEntry)) {
  throw new Error(
    "standalone build not found at .next/standalone/server.js - run `npm run build` first"
  );
}

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