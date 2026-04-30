const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("moonchat", {
  getDashboardSnapshot: () => ipcRenderer.invoke("app:get-dashboard-snapshot"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  requestTelegramUserCode: (channel) => ipcRenderer.invoke("telegram-user:request-code", channel),
  requestWhatsappQr: (channel) => ipcRenderer.invoke("whatsapp:request-qr", channel),
  getWhatsappStatus: (channelId) => ipcRenderer.invoke("whatsapp:get-status", channelId),
  getChannelStatus: (channel) => ipcRenderer.invoke("channel:get-status", channel),
  listRelevantMemories: (payload) => ipcRenderer.invoke("memory:list-relevant", payload),
  getGlobalAiMemories: () => ipcRenderer.invoke("memory:get-global-ai"),
  updateGlobalAiMemory: (payload) => ipcRenderer.invoke("memory:update-global-ai", payload),
  listKnowledgeDocuments: () => ipcRenderer.invoke("rag:list-documents"),
  getKnowledgeEmbeddingStatus: () => ipcRenderer.invoke("rag:get-embedding-status"),
  getKnowledgeProgress: () => ipcRenderer.invoke("rag:get-progress"),
  importKnowledgeFiles: () => ipcRenderer.invoke("rag:import-files"),
  deleteKnowledgeDocument: (documentId) => ipcRenderer.invoke("rag:delete-document", documentId),
  rebuildKnowledgeDocument: (documentId) => ipcRenderer.invoke("rag:rebuild-document", documentId),
  openKnowledgeDocument: (documentId) => ipcRenderer.invoke("rag:open-document", documentId),
  searchKnowledge: (query, limit) => ipcRenderer.invoke("rag:search", { query, limit }),
  listConversations: () => ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId) =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  getConversationMessagePage: (conversationId, options) =>
    ipcRenderer.invoke("conversation:get-message-page", {
      conversationId,
      beforeCreatedAt: options?.beforeCreatedAt,
      limit: options?.limit,
    }),
  countUnreadMessages: (readStates) =>
    ipcRenderer.invoke("conversation:count-unread", { readStates }),
  sendManualMessage: (conversationId, text, options) =>
    ipcRenderer.invoke("conversation:send-manual-message", {
      conversationId,
      text,
      imageDataUrl: options?.imageDataUrl,
      imageMimeType: options?.imageMimeType,
      attachmentDataUrl: options?.attachmentDataUrl,
      attachmentMimeType: options?.attachmentMimeType,
      attachmentKind: options?.attachmentKind,
      attachmentFileName: options?.attachmentFileName,
    }),
  updateMessage: (messageId, nextText) =>
    ipcRenderer.invoke("conversation:update-message", { messageId, nextText }),
  deleteMessage: (messageId) => ipcRenderer.invoke("conversation:delete-message", { messageId }),
  clearConversationMessages: (conversationId) =>
    ipcRenderer.invoke("conversation:clear-messages", { conversationId }),
  updateParticipantLabel: (conversationId, participantLabel) =>
    ipcRenderer.invoke("conversation:update-participant-label", { conversationId, participantLabel }),
  triggerLearning: (conversationId) => ipcRenderer.invoke("learning:trigger", conversationId),
  syncTelegramUserRecentHistory: (conversationId) =>
    ipcRenderer.invoke("telegram-user:sync-recent-history", conversationId),
  toggleAutoReply: (conversationId, enabled) =>
    ipcRenderer.invoke("conversation:toggle-auto-reply", { conversationId, enabled }),
  onConversationChanged: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };
    ipcRenderer.on("conversation:changed", wrappedListener);
    return () => {
      ipcRenderer.removeListener("conversation:changed", wrappedListener);
    };
  },
  onKnowledgeProgress: (listener) => {
    const wrappedListener = (_event, payload) => {
      listener(payload);
    };
    ipcRenderer.on("rag:progress", wrappedListener);
    return () => {
      ipcRenderer.removeListener("rag:progress", wrappedListener);
    };
  },
});
