import { contextBridge, ipcRenderer } from "electron";
import type {
  AppDashboardSnapshot,
  AppSettings,
  ChannelConfig,
  ConversationMessage,
  ConversationSummary,
  MemoryEntry,
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
  listConversations: (): Promise<ConversationSummary[]> =>
    ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId: string): Promise<ConversationMessage[]> =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  sendManualMessage: (
    conversationId: string,
    text: string,
    options?: { imageDataUrl?: string; imageMimeType?: string },
  ): Promise<{ ok: boolean; externalMessageId?: string }> =>
    ipcRenderer.invoke("conversation:send-manual-message", {
      conversationId,
      text,
      imageDataUrl: options?.imageDataUrl,
      imageMimeType: options?.imageMimeType,
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
