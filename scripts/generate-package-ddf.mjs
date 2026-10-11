import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const LOG = "[generate-package-ddf]";

function resolveBase() {
  const idx = process.argv.indexOf("--root");
  if (idx === -1) return REPO_ROOT;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) fail("--root requires a directory argument");
  const base = path.resolve(value);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    fail(`--root is not a directory: ${base}`);
  }
  return base;
}

const BASE = resolveBase();
const PKG = path.join(BASE, ".desktop-package");
const DDF = path.join(BASE, "desktop", "installer", "package.ddf");
const PREFIX = PKG + path.sep;

const HEADER = [
  "; F.3.4 payload cabinet",
  ".Set CabinetNameTemplate=AI-Cost-Management-Payload.cab",
  ".Set DiskDirectoryTemplate=.",
  ".Set CompressionType=LZX",
  ".Set Compress=on",
  ".Set Cabinet=on",
  ".Set CabinetFileCountThreshold=0",
  ".Set FolderFileCountThreshold=0",
  ".Set FolderSizeThreshold=0",
  ".Set MaxCabinetSize=0",
  ".Set MaxDiskFileCount=0",
  ".Set MaxDiskSize=0",
  ".Set RptFileName=makecablog.txt",
];

// Project-defined conservative limit for makecab path safety; not a verified makecab hard limit.
const MAX_ABS_PATH = 260;

const REQUIRED = [
  "AI Cost Management.exe",
  "desktop\\launcher.mjs",
  "runtime\\LICENSE",
  "runtime\\node.exe",
  "runtime\\README.md",
  ".next\\standalone\\server.js",
  ".next\\standalone\\package.json",
  ".next\\standalone\\.next\\BUILD_ID",
];

const checkMode = process.argv.includes("--check");

function fail(...parts) {
  console.error(LOG, ...parts);
  process.exit(1);
}

function enumeratePackageFiles() {
  if (!fs.existsSync(PKG) || !fs.statSync(PKG).isDirectory()) {
    fail(`.desktop-package missing or not a directory: ${PKG}`);
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`unexpected symlink: ${full}`);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(full);
      } else {
        fail(`unexpected non-regular entry: ${full}`);
      }
    }
  };
  walk(PKG);
  if (files.length === 0) fail(".desktop-package contains no files");
  return files;
}

function buildEntries(files) {
  const errors = [];
  const entries = [];
  for (const abs of files) {
    if (!abs.startsWith(PREFIX)) {
      errors.push(`file escapes package root: ${abs}`);
      continue;
    }
    const absOut = abs.split(path.sep).join("\\");
    const relOut = abs.slice(PREFIX.length).split(path.sep).join("\\");
    if (/[^\x20-\x7E]/.test(absOut) || absOut.includes('"')) {
      errors.push(`non-ASCII or quote character in path: ${absOut}`);
      continue;
    }
    if (/(^|\\)data(\\|$)/i.test(relOut)) {
      errors.push(`forbidden data directory: ${relOut}`);
    }
    if (/\.(db|db-wal|db-shm)$/i.test(relOut)) {
      errors.push(`forbidden database file: ${relOut}`);
    }
    if (absOut.length > MAX_ABS_PATH) {
      errors.push(`absolute path exceeds project-defined limit ${MAX_ABS_PATH}: ${absOut}`);
    }
    entries.push({ abs: absOut, rel: relOut });
  }
  const seen = new Map();
  for (const entry of entries) {
    const key = entry.rel.toLowerCase();
    if (seen.has(key)) {
      errors.push(`duplicate target path (case-insensitive): "${seen.get(key)}" vs "${entry.rel}"`);
    } else {
      seen.set(key, entry.rel);
    }
  }
  if (errors.length > 0) {
    for (const message of errors.slice(0, 20)) console.error(LOG, message);
    if (errors.length > 20) console.error(LOG, `...and ${errors.length - 20} more errors`);
    fail(`${errors.length} validation error(s); nothing written`);
  }
  return entries;
}

function validateRequiredAndBuildId(entries) {
  const relSet = new Set(entries.map((e) => e.rel.toLowerCase()));
  const missing = REQUIRED.filter((req) => !relSet.has(req.toLowerCase()));
  if (missing.length > 0) {
    for (const req of missing) console.error(LOG, `missing required file: ${req}`);
    fail(`${missing.length} required file(s) missing; nothing written`);
  }
  const buildIdFile = path.join(PKG, ".next", "standalone", ".next", "BUILD_ID");
  const buildId = fs.readFileSync(buildIdFile, "utf8").trim();
  if (!buildId) fail(`BUILD_ID file is empty: ${buildIdFile}`);
  const staticDir = path.join(PKG, ".next", "standalone", ".next", "static");
  if (!fs.existsSync(staticDir) || !fs.statSync(staticDir).isDirectory()) {
    fail(`static directory missing or not a directory: ${staticDir}`);
  }
  const buildDirs = fs
    .readdirSync(staticDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "chunks" && e.name !== "media")
    .map((e) => e.name);
  if (buildDirs.length !== 1 || buildDirs[0] !== buildId) {
    fail(`BUILD_ID/static mismatch: BUILD_ID="${buildId}", static build dirs=[${buildDirs.join(", ")}]`);
  }
  const idPrefix = `.next\\standalone\\.next\\static\\${buildId}\\`.toLowerCase();
  const idFileCount = entries.filter((e) => e.rel.toLowerCase().startsWith(idPrefix)).length;
  if (idFileCount === 0) {
    fail(`no files under .next\\standalone\\.next\\static\\${buildId}`);
  }
  return buildId;
}

function parseExistingDdf() {
  if (!fs.existsSync(DDF)) fail(`existing ddf not found: ${DDF}`);
  const raw = fs.readFileSync(DDF, "utf8");
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const errors = [];
  const targets = [];
  const directives = [];
  for (const line of lines) {
    if (line === "") {
      errors.push("blank line in ddf");
      continue;
    }
    if (line.startsWith(";") || line.startsWith(".")) {
      directives.push(line);
      continue;
    }
    const match = line.match(/^"([^"]+)" "([^"]+)"$/);
    if (!match) {
      errors.push(`malformed ddf line: ${line.slice(0, 160)}`);
      continue;
    }
    targets.push(match[2]);
  }
  if (
    directives.length !== HEADER.length ||
    directives.some((line, i) => line !== HEADER[i])
  ) {
    errors.push(
      `ddf header does not exactly match the expected ${HEADER.length} directive lines in order`
    );
    for (let i = 0; i < Math.max(directives.length, HEADER.length); i++) {
      if (directives[i] !== HEADER[i]) {
        errors.push(
          `  header line ${i + 1}: expected "${HEADER[i] ?? "<missing>"}", found "${directives[i] ?? "<missing>"}"`
        );
        break;
      }
    }
  }
  const seen = new Map();
  for (const target of targets) {
    const key = target.toLowerCase();
    if (seen.has(key)) errors.push(`duplicate target in existing ddf: "${seen.get(key)}" vs "${target}"`);
    else seen.set(key, target);
  }
  if (errors.length > 0) {
    for (const message of errors.slice(0, 20)) console.error(LOG, message);
    fail(`${errors.length} parse error(s) in existing ddf`);
  }
  return targets;
}

const files = enumeratePackageFiles();
const entries = buildEntries(files);
const buildId = validateRequiredAndBuildId(entries);
entries.sort((a, b) => a.rel.localeCompare(b.rel, "en-US"));
console.log(LOG, `package files: ${files.length}, build id: ${buildId}`);

if (checkMode) {
  const ddfTargets = parseExistingDdf();
  const generated = new Set(entries.map((e) => e.rel));
  const existing = new Set(ddfTargets);
  const missingInDdf = entries.map((e) => e.rel).filter((t) => !existing.has(t));
  const extraInDdf = ddfTargets.filter((t) => !generated.has(t));
  console.log(LOG, `generated targets: ${generated.size}, existing ddf targets: ${existing.size}`);
  if (missingInDdf.length > 0 || extraInDdf.length > 0) {
    console.error(LOG, `missing in ddf (in package, not in ddf): ${missingInDdf.length}`);
    for (const t of missingInDdf.slice(0, 10)) console.error(LOG, `  + ${t}`);
    if (missingInDdf.length > 10) console.error(LOG, `  ...and ${missingInDdf.length - 10} more`);
    console.error(LOG, `extra in ddf (in ddf, not in package): ${extraInDdf.length}`);
    for (const t of extraInDdf.slice(0, 10)) console.error(LOG, `  - ${t}`);
    if (extraInDdf.length > 10) console.error(LOG, `  ...and ${extraInDdf.length - 10} more`);
    fail("check failed: ddf target set does not match package file set");
  }
  console.log(LOG, "check passed: ddf target set matches package file set");
  process.exit(0);
}

const lines = [...HEADER, ...entries.map((e) => `"${e.abs}" "${e.rel}"`)];
const content = lines.join("\r\n") + "\r\n";
fs.writeFileSync(DDF, content, "utf8");
console.log(LOG, `wrote ${DDF} (${entries.length} file entries)`);
