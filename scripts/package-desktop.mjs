import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOG = "[package-desktop]";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, ".next");
const STANDALONE_DIR = join(DIST_DIR, "standalone");
const RUNTIME_SRC = join(ROOT, ".desktop-runtime-staging", "runtime");
const LAUNCHER_SRC = join(ROOT, "desktop", "launcher.mjs");
const PACKAGE_DIR = join(ROOT, ".desktop-package");

const CSC = join(
  "C:\\Windows\\Microsoft.NET\\Framework64",
  "v4.0.30319",
  "csc.exe"
);
const EXE_SRC = join(ROOT, "desktop", "launcher-exe.cs");
const EXE_DST = join(PACKAGE_DIR, "AI Cost Management.exe");

const STATIC_SRC = join(DIST_DIR, "static");
const STATIC_DST = join(STANDALONE_DIR, ".next", "static");
const PUBLIC_SRC = join(ROOT, "public");
const PUBLIC_DST = join(STANDALONE_DIR, "public");

function fail(message) {
  console.error(`${LOG} ${message}`);
  process.exit(1);
}

function cleanCopy(source, target, label) {
  if (!existsSync(source)) {
    fail(`${label}: source missing at ${source}`);
  }
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
  cpSync(source, target, { recursive: true });
  console.log(`${LOG} ${label}: copied ${source} -> ${target}`);
}

function sha256Of(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
    stream.on("error", reject);
  });
}

function isValidPe(file) {
  const buffer = readFileSync(file);
  if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) {
    return false;
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 6 > buffer.length) {
    return false;
  }
  return (
    buffer[peOffset] === 0x50 &&
    buffer[peOffset + 1] === 0x45 &&
    buffer[peOffset + 2] === 0x00 &&
    buffer[peOffset + 3] === 0x00
  );
}

// A. Build the standalone output.
console.log(`${LOG} Running npm run build ...`);
execFileSync("npm run build", {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

// B. Core standalone checks.
for (const [label, file] of [
  ["server.js", join(STANDALONE_DIR, "server.js")],
  [".next/server", join(STANDALONE_DIR, ".next", "server")],
]) {
  if (!existsSync(file)) {
    fail(
      `${label} missing at ${file} - did "next build" produce a standalone output?`
    );
  }
}

// C. Copy client static assets into the standalone output.
cleanCopy(STATIC_SRC, STATIC_DST, "static assets");

// D. Copy the public asset root into the standalone output.
cleanCopy(PUBLIC_SRC, PUBLIC_DST, "public assets");

// E. Remove any development database copied into the standalone output.
const DATA_DST = join(STANDALONE_DIR, "data");
if (existsSync(DATA_DST)) {
  rmSync(DATA_DST, { recursive: true, force: true });
  console.log(
    `${LOG} removed ${DATA_DST} (development database must not ship)`
  );
}

// F. Assemble the final desktop package.
if (existsSync(PACKAGE_DIR)) {
  rmSync(PACKAGE_DIR, { recursive: true, force: true });
}
mkdirSync(join(PACKAGE_DIR, ".next"), { recursive: true });
mkdirSync(join(PACKAGE_DIR, "desktop"), { recursive: true });

cleanCopy(
  STANDALONE_DIR,
  join(PACKAGE_DIR, ".next", "standalone"),
  "standalone app (into package)"
);
cleanCopy(RUNTIME_SRC, join(PACKAGE_DIR, "runtime"), "Node runtime (into package)");
cpSync(LAUNCHER_SRC, join(PACKAGE_DIR, "desktop", "launcher.mjs"));
console.log(
  `${LOG} launcher: copied ${LAUNCHER_SRC} -> ${join(PACKAGE_DIR, "desktop", "launcher.mjs")}`
);

// G. Compile the Windows EXE launcher with the system .NET Framework compiler.
if (!existsSync(EXE_SRC)) {
  fail(`launcher source missing at ${EXE_SRC}`);
}
if (!existsSync(CSC)) {
  fail(`csc.exe not found at ${CSC} - cannot compile the desktop launcher`);
}
console.log(
  `${LOG} Compiling ${EXE_SRC} -> ${EXE_DST}`
);
try {
  execFileSync(
    CSC,
    [
      "/nologo",
      "/target:exe",
      "/r:System.dll",
      `/out:${EXE_DST}`,
      EXE_SRC,
    ],
    { cwd: ROOT, stdio: "inherit" }
  );
} catch (error) {
  fail(`launcher compilation failed - cannot produce ${EXE_DST}: ${error.message}`);
}

// H. Strict validation of the final package.
const PKG_STANDALONE = join(PACKAGE_DIR, ".next", "standalone");

const REQUIRED = [
  ["AI Cost Management.exe", EXE_DST],
  ["runtime/node.exe", join(PACKAGE_DIR, "runtime", "node.exe")],
  ["runtime/LICENSE", join(PACKAGE_DIR, "runtime", "LICENSE")],
  ["runtime/README.md", join(PACKAGE_DIR, "runtime", "README.md")],
  ["desktop/launcher.mjs", join(PACKAGE_DIR, "desktop", "launcher.mjs")],
  ["standalone/server.js", join(PKG_STANDALONE, "server.js")],
  ["standalone/package.json", join(PKG_STANDALONE, "package.json")],
  ["standalone/node_modules", join(PKG_STANDALONE, "node_modules")],
  ["standalone/.next/server", join(PKG_STANDALONE, ".next", "server")],
  ["standalone/.next/static", join(PKG_STANDALONE, ".next", "static")],
  ["standalone/public", join(PKG_STANDALONE, "public")],
];

const FORBIDDEN = [
  ["standalone/data (development database)", join(PKG_STANDALONE, "data")],
  ["runtime/npm", join(PACKAGE_DIR, "runtime", "npm")],
  ["runtime/npx", join(PACKAGE_DIR, "runtime", "npx")],
  ["runtime/corepack", join(PACKAGE_DIR, "runtime", "corepack")],
  ["runtime/node_modules", join(PACKAGE_DIR, "runtime", "node_modules")],
];

const problems = [];
for (const [label, file] of REQUIRED) {
  if (!existsSync(file)) {
    problems.push(`MISSING ${label} at ${file}`);
  }
}
for (const [label, file] of FORBIDDEN) {
  if (existsSync(file)) {
    problems.push(`MUST NOT EXIST ${label} at ${file}`);
  }
}

// H1. The launcher EXE must be a valid, non-empty PE/MZ binary.
if (existsSync(EXE_DST)) {
  const exeSize = statSync(EXE_DST).size;
  if (exeSize <= 0) {
    problems.push(`AI Cost Management.exe has size 0 at ${EXE_DST}`);
  } else if (!isValidPe(EXE_DST)) {
    problems.push(`AI Cost Management.exe is not a valid PE/MZ binary at ${EXE_DST}`);
  }
}

// H2. No database artifacts may exist anywhere inside the package.
function scanTreeForForbidden(scanRoot) {
  const found = [];
  for (const entry of readdirSync(scanRoot, { withFileTypes: true })) {
    const full = join(scanRoot, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "data") {
        found.push(`data directory at ${full}`);
      }
      found.push(...scanTreeForForbidden(full));
    } else if (
      entry.name.toLowerCase().endsWith(".db") ||
      entry.name.toLowerCase().endsWith(".db-wal") ||
      entry.name.toLowerCase().endsWith(".db-shm")
    ) {
      found.push(`database file at ${full}`);
    }
  }
  return found;
}
for (const forbidden of scanTreeForForbidden(PACKAGE_DIR)) {
  problems.push(`MUST NOT EXIST ${forbidden}`);
}

if (problems.length > 0) {
  console.error(`${LOG} Validation failed:`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

// I. Final package summary.
const runtimeNode = join(PACKAGE_DIR, "runtime", "node.exe");
const runtimeVersion = execFileSync(runtimeNode, ["--version"], {
  encoding: "utf8",
}).trim();
const runtimeSha = await sha256Of(runtimeNode);
const runtimeFiles = readdirSync(join(PACKAGE_DIR, "runtime"))
  .filter((name) => name !== "node.exe" && name !== "LICENSE" && name !== "README.md");

console.log("");
console.log(`${LOG} Package verified:`);
console.log(`  package path : ${PACKAGE_DIR}`);
const exeSize = statSync(EXE_DST).size;
console.log(`  launcher exe : ${EXE_DST} (${exeSize} bytes)`);
console.log(`  runtime node : ${runtimeVersion} (${execFileSync(runtimeNode, ["-p", "process.arch"], { encoding: "utf8" }).trim()})`);
console.log(`  runtime sha256 : ${runtimeSha}`);
console.log(`  runtime files : node.exe, LICENSE, README.md${runtimeFiles.length > 0 ? ` + UNEXPECTED: ${runtimeFiles.join(", ")}` : ""}`);
console.log(`  standalone top-level:`);
for (const entry of readdirSync(PKG_STANDALONE).sort()) {
  console.log(`    - ${entry}`);
}
console.log(`  standalone/.next/static : present`);
console.log(`  standalone/public       : present`);
console.log(`  standalone/data         : absent`);
console.log(`${LOG} Done.`);