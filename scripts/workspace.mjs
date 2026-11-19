import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const api = path.join(root, "apps", "api");
const web = path.join(root, "apps", "web");
const windows = process.platform === "win32";
const children = new Set();
let stopping = false;
let shutdownPromise;

function write(message) {
  process.stderr.write(`[CrisisMap] ${message}\n`);
}

function npmCommand(args, cwd, label, env = {}) {
  // npm.cmd needs a shell on Windows. Invoking npm's JS entry point with Node
  // avoids a shell entirely, preserving spaces and literal arguments on all OSes.
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  const cli = candidates.find((candidate) => candidate && /\.[cm]?js$/i.test(candidate) && existsSync(candidate));
  if (!cli) throw new Error("Cannot locate npm's JavaScript CLI. Run this task with npm run from the crisismap directory.");
  return { command: process.execPath, args: [cli, ...args], cwd, label, env };
}

function launch({ command, args, cwd, label, env = {} }) {
  write(`Starting ${label}`);
  const child = spawn(command, args, {
    cwd, env: { ...process.env, ...env }, stdio: "inherit", shell: false,
    windowsHide: true, detached: !windows,
  });
  const handle = { child, label, done: undefined };
  handle.done = new Promise((resolve) => {
    child.once("error", (error) => {
      children.delete(handle);
      write(`${label}: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code, signal) => {
      children.delete(handle);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
  children.add(handle);
  return handle;
}

async function stopTree({ child }) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (windows) {
    // Fixed executable and numeric PID arguments, with no command-string shell.
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore", windowsHide: true, shell: false,
      });
      killer.once("error", () => { child.kill(); resolve(); });
      killer.once("close", resolve);
    });
  } else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
    }, 5000);
    timer.unref();
  }
}

function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  process.exitCode = code;
  const active = [...children];
  shutdownPromise = (async () => {
    if (active.length) write("Stopping child processes");
    await Promise.allSettled(active.map(stopTree));
    await Promise.allSettled(active.map((handle) => handle.done));
  })();
  return shutdownPromise;
}

process.once("SIGINT", () => { void shutdown(130); });
process.once("SIGTERM", () => { void shutdown(143); });

async function sequential(commands) {
  for (const command of commands) {
    if (stopping) return;
    const code = await launch(command).done;
    if (!stopping && code !== 0) throw new Error(`${command.label} exited with code ${code}`);
  }
}

async function servers(production) {
  const env = { NODE_ENV: production ? "production" : "development" };
  const commands = [
    npmCommand(["run", production ? "start" : "start:dev"], api, "API at http://localhost:4000", env),
    npmCommand(["run", production ? "start" : "dev", "--", "--port", "3000"], web, "web at http://localhost:3000", env),
  ];
  const running = commands.map(launch);
  const first = await Promise.race(running.map(async (handle) => ({ handle, code: await handle.done })));
  if (!stopping) {
    write(`${first.handle.label} stopped; stopping the other server`);
    await shutdown(first.code || 1);
  }
}

async function createMissingEnv(directory) {
  try {
    await copyFile(path.join(directory, ".env.example"), path.join(directory, ".env.local"), constants.COPYFILE_EXCL);
    write(`Created ${path.relative(root, path.join(directory, ".env.local"))} from its example`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

async function main() {
  const action = process.argv[2];
  if (process.argv.length > 3) throw new Error("Extra arguments are not supported by the workspace launcher.");
  switch (action) {
    case "setup":
      await createMissingEnv(api);
      await createMissingEnv(web);
      await sequential([
        npmCommand(["ci"], api, "API dependencies"),
        npmCommand(["ci"], web, "web dependencies"),
        npmCommand(["run", "prisma:generate"], api, "Prisma client generation"),
      ]);
      break;
    case "dev":
      await servers(false);
      break;
    case "start":
      await servers(true);
      break;
    case "build":
    case "type-check":
      await sequential([
        npmCommand(["run", action], api, `API ${action}`),
        npmCommand(["run", action], web, `web ${action}`),
      ]);
      break;
    case "db:deploy":
      await sequential([npmCommand(["exec", "--", "prisma", "migrate", "deploy"], api, "database migrations")]);
      break;
    case "infra:up":
      await sequential([{ command: "docker", args: ["compose", "-f", "infra/docker-compose.yml", "up", "-d"], cwd: root, label: "local Docker infrastructure" }]);
      break;
    default:
      throw new Error("Use npm run setup, dev, build, start, type-check, db:deploy, or infra:up from crisismap.");
  }
}

try {
  await main();
} catch (error) {
  if (!stopping) {
    write(error instanceof Error ? error.message : String(error));
    await shutdown(1);
  }
} finally {
  if (shutdownPromise) await shutdownPromise;
}
