import { contextBridge, ipcRenderer } from "electron";
import type {
  AppDashboardSnapshot,
  AppSettings,
  ChannelConfig,
  ConversationMessage,
  ConversationMessagePage,
  ConversationSummary,
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  MemoryEntry,
  RagProgressEvent,
} from "../src/shared/contracts.js";

const api = {
  getDashboardSnapshot: (): Promise<AppDashboardSnapshot> =>
    ipcRenderer.invoke("app:get-dashboard-snapshot"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", settings),
  requestTelegramUserCode: (
    channel: ChannelConfig,
  ): Promise<{
    ok: boolean;
    alreadyAuthorized: boolean;
    sessionString: string;
    isCodeViaApp: boolean;
  }> => ipcRenderer.invoke("telegram-user:request-code", channel),
  requestWhatsappQr: (
    channel: ChannelConfig,
  ): Promise<{
    ok: boolean;
    authStatePath: string;
    qrDataUrl: string;
    connected: boolean;
  }> => ipcRenderer.invoke("whatsapp:request-qr", channel),
  getWhatsappStatus: (
    channelId: string,
  ): Promise<{
    ok: boolean;
    connected: boolean;
    needsLogin: boolean;
    message: string;
    checkedAt: string;
  }> => ipcRenderer.invoke("whatsapp:get-status", channelId),
  getChannelStatus: (
    channel: ChannelConfig,
  ): Promise<{
    ok: boolean;
    connected: boolean;
    needsLogin: boolean;
    message: string;
    checkedAt: string;
  }> => ipcRenderer.invoke("channel:get-status", channel),
  listRelevantMemories: (payload: {
    conversationId?: string;
    userId?: string;
  }): Promise<MemoryEntry[]> => ipcRenderer.invoke("memory:list-relevant", payload),
  getGlobalAiMemories: (): Promise<MemoryEntry[]> => ipcRenderer.invoke("memory:get-global-ai"),
  updateGlobalAiMemory: (payload: {
    memoryType: "base" | "style" | "knowledge";
    content: string;
    summary: string;
  }): Promise<{ ok: boolean }> => ipcRenderer.invoke("memory:update-global-ai", payload),
  listKnowledgeDocuments: (): Promise<KnowledgeDocumentSummary[]> =>
    ipcRenderer.invoke("rag:list-documents"),
  getKnowledgeEmbeddingStatus: (): Promise<{
    ok: boolean;
    provider: "builtin";
    model: string;
    message: string;
  }> => ipcRenderer.invoke("rag:get-embedding-status"),
  getKnowledgeProgress: (): Promise<RagProgressEvent> => ipcRenderer.invoke("rag:get-progress"),
  importKnowledgeFiles: (): Promise<KnowledgeDocumentSummary[]> =>
    ipcRenderer.invoke("rag:import-files"),
  deleteKnowledgeDocument: (documentId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("rag:delete-document", documentId),
  rebuildKnowledgeDocument: (documentId: string): Promise<KnowledgeDocumentSummary> =>
    ipcRenderer.invoke("rag:rebuild-document", documentId),
  openKnowledgeDocument: (documentId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("rag:open-document", documentId),
  searchKnowledge: (query: string, limit?: number): Promise<KnowledgeSearchResult[]> =>
    ipcRenderer.invoke("rag:search", { query, limit }),
  onKnowledgeProgress: (listener: (payload: RagProgressEvent) => void): (() => void) => {
    const wrappedListener = (_event: unknown, payload: RagProgressEvent) => {
      listener(payload);
    };
    ipcRenderer.on("rag:progress", wrappedListener);
    return () => {
      ipcRenderer.removeListener("rag:progress", wrappedListener);
    };
  },
  listConversations: (): Promise<ConversationSummary[]> =>
    ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId: string): Promise<ConversationMessage[]> =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  getConversationMessagePage: (
    conversationId: string,
    options?: { beforeCreatedAt?: string; limit?: number },
  ): Promise<ConversationMessagePage> =>
    ipcRenderer.invoke("conversation:get-message-page", {
      conversationId,
      beforeCreatedAt: options?.beforeCreatedAt,
      limit: options?.limit,
    }),
  countUnreadMessages: (
    readStates: Array<{ conversationId: string; readAt?: string | null }>,
  ): Promise<Record<string, number>> =>
    ipcRenderer.invoke("conversation:count-unread", { readStates }),
  sendManualMessage: (
    conversationId: string,
    text: string,
    options?: {
      imageDataUrl?: string;
      imageMimeType?: string;
      attachmentDataUrl?: string;
      attachmentMimeType?: string;
      attachmentKind?: string;
      attachmentFileName?: string;
    },
  ): Promise<{ ok: boolean; externalMessageId?: string }> =>
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
  updateMessage: (messageId: string, nextText: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:update-message", { messageId, nextText }),
  deleteMessage: (messageId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:delete-message", { messageId }),
  clearConversationMessages: (conversationId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:clear-messages", { conversationId }),
  updateParticipantLabel: (
    conversationId: string,
    participantLabel: string,
  ): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:update-participant-label", {
      conversationId,
      participantLabel,
    }),
  triggerLearning: (
    conversationId: string,
  ): Promise<{ status: "started" | "running" | "already_learned" }> =>
    ipcRenderer.invoke("learning:trigger", conversationId),
  syncTelegramUserRecentHistory: (
    conversationId: string,
  ): Promise<{ ok: boolean; syncedCount: number }> =>
    ipcRenderer.invoke("telegram-user:sync-recent-history", conversationId),
  toggleAutoReply: (
    conversationId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:toggle-auto-reply", { conversationId, enabled }),
  onConversationChanged: (
    listener: (payload: { conversationId: string | null }) => void,
  ): (() => void) => {
    const wrappedListener = (_event: unknown, payload: { conversationId: string | null }) => {
      listener(payload);
    };
    ipcRenderer.on("conversation:changed", wrappedListener);
    return () => {
      ipcRenderer.removeListener("conversation:changed", wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("moonchat", api);
