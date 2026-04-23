const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("moonchat", {
  getDashboardSnapshot: () => ipcRenderer.invoke("app:get-dashboard-snapshot"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  listRelevantMemories: (payload) => ipcRenderer.invoke("memory:list-relevant", payload),
  getGlobalAiMemories: () => ipcRenderer.invoke("memory:get-global-ai"),
  updateGlobalAiMemory: (payload) => ipcRenderer.invoke("memory:update-global-ai", payload),
  listConversations: () => ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId) =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  sendManualMessage: (conversationId, text, options) =>
    ipcRenderer.invoke("conversation:send-manual-message", {
      conversationId,
      text,
      imageDataUrl: options?.imageDataUrl,
      imageMimeType: options?.imageMimeType,
    }),
  updateMessage: (messageId, nextText) =>
    ipcRenderer.invoke("conversation:update-message", { messageId, nextText }),
  deleteMessage: (messageId) => ipcRenderer.invoke("conversation:delete-message", { messageId }),
  clearConversationMessages: (conversationId) =>
    ipcRenderer.invoke("conversation:clear-messages", { conversationId }),
  triggerLearning: (conversationId) => ipcRenderer.invoke("learning:trigger", conversationId),
  toggleAutoReply: (conversationId, enabled) =>
    ipcRenderer.invoke("conversation:toggle-auto-reply", { conversationId, enabled }),
});
