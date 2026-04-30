/** 预览窗口专用 preload（唯一维护处）；编译为同目录下的 `imagePreviewWindow.js` 旁的 `imagePreviewPreload.js`。 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("moonchatImagePreview", {
  saveAs: (previewId: string, defaultFileName: string) =>
    ipcRenderer.invoke("app:image-preview-save-as", { previewId, defaultFileName }) as Promise<{
      ok: boolean;
      canceled?: boolean;
      filePath?: string;
    }>,
});
