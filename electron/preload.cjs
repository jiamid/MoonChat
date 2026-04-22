const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("moonchat", {
  getDashboardSnapshot: () => ipcRenderer.invoke("app:get-dashboard-snapshot"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  listRelevantMemories: (payload) => ipcRenderer.invoke("memory:list-relevant", payload),
  listConversations: () => ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId) =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  sendManualMessage: (conversationId, text) =>
    ipcRenderer.invoke("conversation:send-manual-message", { conversationId, text }),
  updateMessage: (messageId, nextText) =>
    ipcRenderer.invoke("conversation:update-message", { messageId, nextText }),
  deleteMessage: (messageId) => ipcRenderer.invoke("conversation:delete-message", { messageId }),
  triggerLearning: (conversationId) => ipcRenderer.invoke("learning:trigger", conversationId),
  toggleAutoReply: (conversationId, enabled) =>
    ipcRenderer.invoke("conversation:toggle-auto-reply", { conversationId, enabled }),
});
