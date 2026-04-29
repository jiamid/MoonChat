/// <reference types="vite/client" />

interface Window {
  moonchat: {
    getDashboardSnapshot: () => Promise<import("./shared/contracts").AppDashboardSnapshot>;
    getSettings: () => Promise<import("./shared/contracts").AppSettings>;
    updateSettings: (
      settings: import("./shared/contracts").AppSettings,
    ) => Promise<import("./shared/contracts").AppSettings>;
    requestTelegramUserCode: (
      channel: import("./shared/contracts").ChannelConfig,
    ) => Promise<{
      ok: boolean;
      alreadyAuthorized: boolean;
      sessionString: string;
      isCodeViaApp: boolean;
    }>;
    requestWhatsappQr: (
      channel: import("./shared/contracts").ChannelConfig,
    ) => Promise<{
      ok: boolean;
      authStatePath: string;
      qrDataUrl: string;
      connected: boolean;
    }>;
    getWhatsappStatus: (channelId: string) => Promise<{
      ok: boolean;
      connected: boolean;
      needsLogin: boolean;
      message: string;
      checkedAt: string;
    }>;
    getChannelStatus: (channel: import("./shared/contracts").ChannelConfig) => Promise<{
      ok: boolean;
      connected: boolean;
      needsLogin: boolean;
      message: string;
      checkedAt: string;
    }>;
    listRelevantMemories: (payload: {
      conversationId?: string;
      userId?: string;
    }) => Promise<import("./shared/contracts").MemoryEntry[]>;
    getGlobalAiMemories: () => Promise<import("./shared/contracts").MemoryEntry[]>;
    updateGlobalAiMemory: (payload: {
      memoryType: "base" | "style" | "knowledge";
      content: string;
      summary: string;
    }) => Promise<{ ok: boolean }>;
    listKnowledgeDocuments: () => Promise<import("./shared/contracts").KnowledgeDocumentSummary[]>;
    getKnowledgeEmbeddingStatus: () => Promise<{
      ok: boolean;
      provider: "builtin";
      model: string;
      message: string;
    }>;
    getKnowledgeProgress: () => Promise<import("./shared/contracts").RagProgressEvent>;
    importKnowledgeFiles: () => Promise<import("./shared/contracts").KnowledgeDocumentSummary[]>;
    deleteKnowledgeDocument: (documentId: string) => Promise<{ ok: boolean }>;
    rebuildKnowledgeDocument: (
      documentId: string,
    ) => Promise<import("./shared/contracts").KnowledgeDocumentSummary>;
    openKnowledgeDocument: (documentId: string) => Promise<{ ok: boolean }>;
    searchKnowledge: (
      query: string,
      limit?: number,
    ) => Promise<import("./shared/contracts").KnowledgeSearchResult[]>;
    onKnowledgeProgress: (
      listener: (payload: import("./shared/contracts").RagProgressEvent) => void,
    ) => () => void;
    listConversations: () => Promise<import("./shared/contracts").ConversationSummary[]>;
    getConversationMessages: (
      conversationId: string,
    ) => Promise<import("./shared/contracts").ConversationMessage[]>;
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
    ) => Promise<{ ok: boolean; externalMessageId?: string }>;
    updateMessage: (messageId: string, nextText: string) => Promise<{ ok: boolean }>;
    deleteMessage: (messageId: string) => Promise<{ ok: boolean }>;
    clearConversationMessages: (conversationId: string) => Promise<{ ok: boolean }>;
    updateParticipantLabel: (
      conversationId: string,
      participantLabel: string,
    ) => Promise<{ ok: boolean }>;
    triggerLearning: (
      conversationId: string,
    ) => Promise<{ status: "started" | "running" | "already_learned" }>;
    syncTelegramUserRecentHistory: (
      conversationId: string,
    ) => Promise<{ ok: boolean; syncedCount: number }>;
    toggleAutoReply: (conversationId: string, enabled: boolean) => Promise<{ ok: boolean }>;
    onConversationChanged: (
      listener: (payload: { conversationId: string | null }) => void,
    ) => () => void;
  };
}
