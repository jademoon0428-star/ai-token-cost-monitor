import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOG = "[AI Cost Management]";
const APP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  ".."
);
const SERVER_ENTRY = join(
  APP_ROOT,
  ".next",
  "standalone",
  "server.js"
);
const HOSTNAME = "127.0.0.1";
const READY_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 1_000;
const POLL_INTERVAL_MS = 200;

if (!existsSync(SERVER_ENTRY)) {
  console.error(
    `${LOG} standalone build not found at ${SERVER_ENTRY}. Run \`npm run build\` first.`
  );
  process.exit(1);
}

let serverChild = null;
let ready = false;
let shuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchStatus(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", () => resolve(null));
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy();
      resolve(null);
    });
  });
}

function terminateChild() {
  if (!serverChild || serverChild.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", [
        "/PID",
        String(serverChild.pid),
        "/T",
        "/F",
      ], { stdio: "ignore" });
    } catch {
      // child may already be gone
    }
  } else {
    try {
      serverChild.kill("SIGTERM");
    } catch {
      // child may already be gone
    }
  }
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  terminateChild();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", terminateChild);

const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, HOSTNAME, () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});

const url = `http://${HOSTNAME}:${port}/`;

console.log(`${LOG} Starting...`);
console.log(`${LOG} Server: ${url}`);

const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME,
  PORT: String(port),
};

serverChild = spawn(
  process.execPath,
  [SERVER_ENTRY],
  {
    env,
    cwd: dirname(SERVER_ENTRY),
    stdio: "inherit",
  }
);

serverChild.on("exit", (code) => {
  if (shuttingDown) {
    return;
  }

  if (ready) {
    console.log(
      `${LOG} Server stopped (code ${code}).`
    );
    shutdown();
  }
});

const deadline = Date.now() + READY_TIMEOUT_MS;

while (Date.now() < deadline) {
  if (serverChild.exitCode !== null) {
    break;
  }

  const status = await fetchStatus(url);

  if (status === 200) {
    ready = true;
    break;
  }

  await delay(POLL_INTERVAL_MS);
}

if (ready) {
  console.log(`${LOG} Server ready.`);

  if (process.platform === "win32") {
    const opened = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
    });
    opened.unref();
    console.log(`${LOG} Opening browser...`);
  } else {
    console.log(
      `${LOG} Open ${url} in a browser.`
    );
  }

  await new Promise(() => {});
} else if (serverChild.exitCode !== null) {
  console.error(
    `${LOG} Server exited before becoming ready (PID ${serverChild.pid}, code ${serverChild.exitCode}).`
  );
  process.exit(1);
} else {
  console.error(`${LOG} Server did not become ready in ${READY_TIMEOUT_MS / 1000}s.`);
  console.error(`${LOG} Server PID: ${serverChild.pid ?? "unknown"}`);
  console.error(`${LOG} URL: ${url}`);
  shutdown();
  process.exit(1);
}