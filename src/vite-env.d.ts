/// <reference types="vite/client" />

interface Window {
  moonchat: {
    getDashboardSnapshot: () => Promise<import("./shared/contracts").AppDashboardSnapshot>;
    getSettings: () => Promise<import("./shared/contracts").AppSettings>;
    updateSettings: (
      settings: import("./shared/contracts").AppSettings,
    ) => Promise<import("./shared/contracts").AppSettings>;
    listRelevantMemories: (payload: {
      conversationId?: string;
      userId?: string;
    }) => Promise<import("./shared/contracts").MemoryEntry[]>;
    listConversations: () => Promise<import("./shared/contracts").ConversationSummary[]>;
    getConversationMessages: (
      conversationId: string,
    ) => Promise<import("./shared/contracts").ConversationMessage[]>;
    sendManualMessage: (
      conversationId: string,
      text: string,
    ) => Promise<{ ok: boolean; externalMessageId?: string }>;
    updateMessage: (messageId: string, nextText: string) => Promise<{ ok: boolean }>;
    deleteMessage: (messageId: string) => Promise<{ ok: boolean }>;
    triggerLearning: (conversationId: string) => Promise<{ ok: boolean }>;
    toggleAutoReply: (conversationId: string, enabled: boolean) => Promise<{ ok: boolean }>;
  };
}
