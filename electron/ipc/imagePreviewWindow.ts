import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, screen } from "electron";
import {
  registerImagePreviewTempFile,
  unregisterImagePreviewTempFile,
} from "./imagePreviewRegistry.js";

export type ImagePreviewPayload = {
  dataUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
};

const IS_DARWIN = process.platform === "darwin";

const IC = {
  chevL: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  chevR: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`,
  zoomOut: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/><path d="M8 11h6"/></svg>`,
  zoomIn: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/><path d="M11 8v6M8 11h6"/></svg>`,
  fit: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/></svg>`,
  rotateCcw: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><g transform="translate(12 12) scale(-1,1) translate(-12 -12)"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></g></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>`,
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizePreviewFileName(fileName?: string | null) {
  return fileName?.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function getImageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

async function writePreviewImageToTemp(
  payload: ImagePreviewPayload,
): Promise<{ filePath: string; suggestedFileName: string }> {
  const match = payload.dataUrl.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw new Error("图片数据格式无效。");
  }

  const mimeType = payload.mimeType || match[1] || "image/png";
  const extension = getImageExtension(mimeType);
  const baseName = sanitizePreviewFileName(payload.fileName) || `moonchat-image-${randomUUID()}.${extension}`;
  const suggestedFileName = path.extname(baseName) ? baseName : `${baseName}.${extension}`;
  const previewDir = path.join(app.getPath("temp"), "moonchat-previews");
  const imageFilePath = path.join(previewDir, `${Date.now()}-${suggestedFileName}`);

  await mkdir(previewDir, { recursive: true });
  await writeFile(imageFilePath, Buffer.from(match[2], "base64"));

  return { filePath: imageFilePath, suggestedFileName };
}

function getImagePreviewPreloadPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "imagePreviewPreload.js");
}

function buildPreviewDocumentHtml(params: {
  fileSrc: string;
  titleBase: string;
  windowTitle: string;
  previewId: string;
  defaultFileName: string;
  isDarwin: boolean;
}): string {
  const safeTitle = escapeHtml(params.titleBase);
  const safeWinTitle = escapeHtml(params.windowTitle);
  const previewIdJson = JSON.stringify(params.previewId);
  const defaultFileJson = JSON.stringify(params.defaultFileName);
  const platformClass = params.isDarwin ? "platform-darwin" : "platform-win";
  return `<!DOCTYPE html>
<html lang="zh-CN" class="${platformClass}">
<head>
  <meta charset="utf-8" />
  <title>${safeWinTitle}</title>
  <style>
    html, body {
      margin: 0;
      height: 100%;
      background: #d8dbe0;
      color: #2b2d33;
      font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    /* 顶栏参考 Lark / macOS：灰底分组 + 竖线分隔 */
    .toolbar {
      flex-shrink: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      min-height: 44px;
      padding: 8px 10px 9px;
      box-sizing: border-box;
      background: linear-gradient(180deg, #f9fafb 0%, #ebecef 100%);
      border-bottom: 1px solid #c9ccd5;
      -webkit-app-region: drag;
      user-select: none;
    }
    html.platform-darwin .toolbar {
      padding-left: 78px;
    }
    .tb-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      -webkit-app-region: no-drag;
    }
    .tb-divider {
      align-self: center;
      width: 1px;
      height: 22px;
      margin: 0 6px;
      background: #c9ccd5;
      -webkit-app-region: no-drag;
    }
    .ico-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #3a3d45;
      cursor: pointer;
    }
    .ico-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.07);
    }
    .ico-btn:active:not(:disabled) {
      background: rgba(0, 0, 0, 0.1);
    }
    .ico-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .zoom-pct {
      min-width: 52px;
      height: 28px;
      margin: 0 2px;
      padding: 0 6px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #2b2d33;
      font: 500 13px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      -webkit-app-region: no-drag;
    }
    .zoom-pct:hover {
      background: rgba(0, 0, 0, 0.06);
    }
    .viewport {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: #ced1d8;
    }
    .img-wrap {
      display: inline-block;
      line-height: 0;
      transform-origin: center center;
      transition: transform 0.07s ease-out;
    }
    .canvas-sheet {
      display: inline-block;
      line-height: 0;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08);
    }
    #pic {
      display: block;
      max-width: min(100vw - 48px, 1600px);
      max-height: calc(100vh - 120px);
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 8px;
      vertical-align: middle;
    }
  </style>
</head>
<body>
  <header class="toolbar" id="toolbar">
    <div class="tb-group">
      <button type="button" class="ico-btn" id="btn-prev" disabled title="上一张（当前仅单张预览）">${IC.chevL}</button>
      <button type="button" class="ico-btn" id="btn-next" disabled title="下一张（当前仅单张预览）">${IC.chevR}</button>
    </div>
    <span class="tb-divider" aria-hidden="true"></span>
    <div class="tb-group">
      <button type="button" class="ico-btn" id="btn-zoom-out" title="缩小">${IC.zoomOut}</button>
      <button type="button" class="zoom-pct" id="btn-zoom-pct" title="点击重置为 100%"><span id="zoomPct">100%</span></button>
      <button type="button" class="ico-btn" id="btn-zoom-in" title="放大">${IC.zoomIn}</button>
      <button type="button" class="ico-btn" id="btn-fit" title="适应窗口">${IC.fit}</button>
    </div>
    <span class="tb-divider" aria-hidden="true"></span>
    <div class="tb-group">
      <button type="button" class="ico-btn" id="btn-rot" title="逆时针旋转 90°">${IC.rotateCcw}</button>
      <button type="button" class="ico-btn" id="btn-save" title="下载到本地">${IC.download}</button>
    </div>
  </header>
  <div class="viewport" id="viewport">
    <div class="img-wrap" id="img-wrap">
      <div class="canvas-sheet">
        <img src="${params.fileSrc}" alt="${safeTitle}" id="pic" />
      </div>
    </div>
  </div>
  <script>
    (function () {
      var PREVIEW_ID = ${previewIdJson};
      var DEFAULT_FILE = ${defaultFileJson};
      var scale = 1;
      var rotation = 0;
      var MIN_SCALE = 0.12;
      var MAX_SCALE = 8;
      var ZOOM_STEP = 1.12;

      var viewport = document.getElementById("viewport");
      var wrap = document.getElementById("img-wrap");
      var pic = document.getElementById("pic");
      var elZoomPct = document.getElementById("zoomPct");

      function updateZoomPct() {
        elZoomPct.textContent = Math.round(scale * 100) + "%";
      }

      function applyTransform() {
        wrap.style.transform = "rotate(" + rotation + "deg) scale(" + scale + ")";
        updateZoomPct();
      }

      function zoomIn() {
        scale = Math.min(MAX_SCALE, scale * ZOOM_STEP);
        applyTransform();
      }
      function zoomOut() {
        scale = Math.max(MIN_SCALE, scale / ZOOM_STEP);
        applyTransform();
      }
      function zoomPctReset() {
        scale = 1;
        applyTransform();
      }

      function fitToWindow() {
        var savedScale = scale;
        scale = 1;
        wrap.style.transform = "rotate(" + rotation + "deg) scale(" + scale + ")";
        updateZoomPct();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var box = wrap.getBoundingClientRect();
            var vw = viewport.clientWidth - 24;
            var vh = viewport.clientHeight - 24;
            var rw = box.width;
            var rh = box.height;
            if (rw < 2 || rh < 2) {
              scale = savedScale;
              applyTransform();
              return;
            }
            var factor = Math.min(vw / rw, vh / rh) * 0.93;
            scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, factor));
            applyTransform();
          });
        });
      }

      function rotateCcw() {
        rotation -= 90;
        applyTransform();
      }

      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          window.close();
          return;
        }
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          zoomIn();
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomOut();
        } else if (e.key === "0" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          zoomPctReset();
        } else if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          fitToWindow();
        } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          rotateCcw();
        }
      });

      viewport.addEventListener(
        "wheel",
        function (e) {
          if (e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          if (e.deltaY < 0) zoomIn();
          else zoomOut();
        },
        { passive: false },
      );

      document.getElementById("btn-zoom-in").addEventListener("click", zoomIn);
      document.getElementById("btn-zoom-out").addEventListener("click", zoomOut);
      document.getElementById("btn-zoom-pct").addEventListener("click", zoomPctReset);
      document.getElementById("btn-fit").addEventListener("click", fitToWindow);
      document.getElementById("btn-rot").addEventListener("click", rotateCcw);

      document.getElementById("btn-save").addEventListener("click", function () {
        if (!window.moonchatImagePreview || typeof window.moonchatImagePreview.saveAs !== "function") {
          window.alert("预览环境未就绪，无法保存文件。");
          return;
        }
        window.moonchatImagePreview.saveAs(PREVIEW_ID, DEFAULT_FILE).then(function (r) {
          if (r && r.canceled) return;
          if (r && r.ok) return;
          window.alert("保存失败或未选择路径。");
        }).catch(function (err) {
          window.alert(err && err.message ? err.message : "保存失败");
        });
      });

      pic.addEventListener("error", function () {
        document.getElementById("toolbar").style.display = "none";
        viewport.innerHTML =
          "<p style=\\"padding:24px;text-align:center;color:#555\\">无法加载图片。</p>";
      });

      applyTransform();
    })();
  </script>
</body>
</html>`;
}

export async function openImagePreviewWindow(payload: ImagePreviewPayload): Promise<void> {
  const previewId = randomUUID();
  const { filePath: imageFilePath, suggestedFileName } = await writePreviewImageToTemp(payload);
  registerImagePreviewTempFile(previewId, imageFilePath);

  const titleBase = payload.fileName?.trim() || "图片预览";
  const windowTitle = `${titleBase} · MoonChat`;

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { width: sw, height: sh } = display.workAreaSize;
  const bounds = display.workArea;
  const winW = Math.min(1000, Math.max(480, sw - 96));
  const winH = Math.min(780, Math.max(360, sh - 96));
  const posX = Math.round(bounds.x + (sw - winW) / 2);
  const posY = Math.round(bounds.y + (sh - winH) / 2);

  const fileSrc = pathToFileURL(imageFilePath).href;
  const html = buildPreviewDocumentHtml({
    fileSrc,
    titleBase,
    windowTitle,
    previewId,
    defaultFileName: suggestedFileName,
    isDarwin: IS_DARWIN,
  });
  const pageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  const preloadPath = getImagePreviewPreloadPath();

  const macTitleBar =
    IS_DARWIN ?
      ({
        titleBarStyle: "hidden",
        trafficLightPosition: { x: 14, y: 12 },
      } as const)
    : {};

  const win = new BrowserWindow({
    ...macTitleBar,
    width: winW,
    height: winH,
    x: posX,
    y: posY,
    minWidth: 360,
    minHeight: 280,
    title: windowTitle,
    backgroundColor: "#d8dbe0",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("closed", () => {
    unregisterImagePreviewTempFile(previewId);
    void unlink(imageFilePath).catch(() => {});
  });

  await win.loadURL(pageUrl);
}
