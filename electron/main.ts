import path from "node:path";
import { app, BrowserWindow, nativeImage } from "electron";
import { fileURLToPath } from "node:url";
import { registerAppIpc } from "./ipc/registerAppIpc.js";
import { AppRuntime } from "./services/runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const shouldOpenDevTools = process.env.MOONCHAT_OPEN_DEVTOOLS === "1";
const isMac = process.platform === "darwin";

let mainWindow: BrowserWindow | null = null;
let runtime: AppRuntime | null = null;

async function createWindow() {
  const preloadPath = isDev
    ? path.join(process.cwd(), "electron", "preload.cjs")
    : path.join(__dirname, "preload.js");
  const appIconPath = path.join(process.cwd(), "logo.png");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#050613",
    show: false,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
        }
      : {}),
    ...(!isMac ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (shouldOpenDevTools) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Renderer failed to load", { errorCode, errorDescription });
  });

  try {
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      await mainWindow.loadFile(path.join(process.cwd(), "dist", "index.html"));
    }
  } catch (error) {
    console.error("Failed to create main window", error);
    mainWindow.destroy();
    mainWindow = null;
  }
}

app.whenReady().then(async () => {
  const appIconPath = path.join(process.cwd(), "logo.png");
  if (isMac) {
    const icon = nativeImage.createFromPath(appIconPath);
    if (!icon.isEmpty()) {
      app.dock?.setIcon(icon);
    }
  }
  runtime = await AppRuntime.bootstrap(app.getPath("userData"));
  registerAppIpc(runtime);
  runtime.conversations.onChanged((payload) => {
    mainWindow?.webContents.send("conversation:changed", payload);
  });
  runtime.rag.onProgress((payload) => {
    mainWindow?.webContents.send("rag:progress", payload);
  });
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await runtime?.shutdown();
});
