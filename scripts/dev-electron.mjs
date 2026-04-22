import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const electronBinary =
  process.platform === "win32"
    ? path.resolve("node_modules", ".bin", "electron.cmd")
    : path.resolve("node_modules", ".bin", "electron");

const electronEntrypoint = path.resolve("dist-electron", "electron", "main.js");
const watchedPaths = [
  path.resolve("dist-electron", "electron"),
  path.resolve("electron", "preload.cjs"),
];

let child = null;
let restartTimer = null;
let isShuttingDown = false;

function startElectron() {
  if (isShuttingDown) {
    return;
  }

  child = spawn(electronBinary, [electronEntrypoint], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", () => {
    child = null;
  });
}

function stopElectron() {
  if (!child) {
    return;
  }

  child.removeAllListeners("exit");
  child.kill("SIGTERM");
  child = null;
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    stopElectron();
    startElectron();
  }, 250);
}

function watchPath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  fs.watch(targetPath, { recursive: true }, () => {
    scheduleRestart();
  });
}

for (const watchedPath of watchedPaths) {
  watchPath(watchedPath);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    isShuttingDown = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
    }
    stopElectron();
    process.exit(0);
  });
}

startElectron();
