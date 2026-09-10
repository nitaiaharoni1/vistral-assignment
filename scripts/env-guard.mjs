import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

// Only these public defaults may be committed. Real settings belong in .env.local.
const defaults = {
  OPENROUTER_API_KEY: "",
  OPENROUTER_MODEL: "google/gemini-3.8-flash",
  AGENT_BUDGET_USD: "1",
  AGENT_PORT: "4174",
  PAPERPLAY_DIR: ".paperplay",
};
const mode = process.argv[2] || "worktree";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const config = (key) => {
  const result = spawnSync("git", ["config", "--get", key], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};
const checkedBlobs = new Set();

function validate(path, content) {
  if (path !== ".env.example") throw new Error(`Private environment file is tracked: ${path}. Keep it local and unstage it.`);
  const entries = content.trimEnd().split(/\r?\n/);
  if (entries.length !== Object.keys(defaults).length) throw new Error(".env.example must contain only the five approved settings, with no extra text.");
  const seen = new Set();
  for (const line of entries) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator < 0 || !Object.hasOwn(defaults, key) || seen.has(key) || line.slice(separator + 1) !== defaults[key]) {
      throw new Error(".env.example differs from the approved public defaults. Put your key and custom settings in .env.local.");
    }
    seen.add(key);
  }
}

function scan(ref) {
  const index = ref === null;
  const records = (index ? git("ls-files", "--stage", "-z") : git("ls-tree", "-r", "-z", ref)).split("\0").filter(Boolean);
  for (const record of records) {
    const tab = record.indexOf("\t");
    const path = record.slice(tab + 1);
    if (!/^\.env(?:\.|$)/.test(basename(path))) continue;
    const [fileMode, second, third] = record.slice(0, tab).split(" ");
    const blob = index ? second : third;
    if (path !== ".env.example" || fileMode !== "100644") throw new Error(`Disallowed environment file: ${path}. Only the regular root .env.example is public.`);
    if (!checkedBlobs.has(blob)) {
      validate(path, git("cat-file", "blob", blob));
      checkedBlobs.add(blob);
    }
  }
}

function previousHook(name, input) {
  const directory = config("paperplay.previousHooksPath");
  if (!directory || resolve(directory) === resolve(".githooks")) return;
  const hook = resolve(directory, name);
  if (!existsSync(hook)) return;
  const result = spawnSync(hook, process.argv.slice(3), { input, stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"] });
  if (result.error) throw new Error(`Could not run existing ${name} hook: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

try {
  if (mode === "install") {
    if (spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" }).status !== 0) {
      console.log("No Git checkout: skipping Git hook installation.");
      process.exit(0);
    }
    const current = config("core.hooksPath") || git("rev-parse", "--git-path", "hooks").trim();
    if (resolve(current) !== resolve(".githooks")) git("config", "--local", "paperplay.previousHooksPath", resolve(current));
    git("config", "--local", "core.hooksPath", ".githooks");
    console.log("Environment guards installed. Existing commit/push hooks are preserved.");
  } else if (mode === "staged") {
    scan(null);
    previousHook("pre-commit");
  } else if (mode === "push") {
    const input = readFileSync(0, "utf8");
    for (const line of input.trim().split("\n").filter(Boolean)) {
      const [, local, , remote] = line.trim().split(/\s+/);
      if (/^0+$/.test(local)) continue;
      const knownRemote = !/^0+$/.test(remote) && spawnSync("git", ["cat-file", "-e", `${remote}^{commit}`], { stdio: "ignore" }).status === 0;
      const commits = git("rev-list", local, ...(knownRemote ? [`^${remote}`] : []))
        .trim()
        .split("\n")
        .filter(Boolean);
      for (const commit of commits) scan(commit);
    }
    previousHook("pre-push", input);
  } else if (mode === "history") {
    for (const commit of git("rev-list", "HEAD").trim().split("\n").filter(Boolean)) scan(commit);
  } else if (mode === "worktree") {
    scan(null);
    if (!lstatSync(".env.example").isFile()) throw new Error(".env.example must be a regular file.");
    validate(".env.example", readFileSync(".env.example", "utf8"));
  } else {
    throw new Error(`Unknown environment guard mode: ${mode}`);
  }
} catch (error) {
  console.error(`Environment guard blocked the operation: ${error.message}`);
  process.exit(1);
}
