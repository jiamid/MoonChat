import { contextBridge, ipcRenderer } from "electron";
import type {
  AppDashboardSnapshot,
  AppSettings,
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
  listRelevantMemories: (payload: {
    conversationId?: string;
    userId?: string;
  }): Promise<MemoryEntry[]> => ipcRenderer.invoke("memory:list-relevant", payload),
  listConversations: (): Promise<ConversationSummary[]> =>
    ipcRenderer.invoke("conversation:list"),
  getConversationMessages: (conversationId: string): Promise<ConversationMessage[]> =>
    ipcRenderer.invoke("conversation:get-messages", conversationId),
  sendManualMessage: (
    conversationId: string,
    text: string,
  ): Promise<{ ok: boolean; externalMessageId?: string }> =>
    ipcRenderer.invoke("conversation:send-manual-message", { conversationId, text }),
  updateMessage: (messageId: string, nextText: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:update-message", { messageId, nextText }),
  deleteMessage: (messageId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:delete-message", { messageId }),
  triggerLearning: (conversationId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("learning:trigger", conversationId),
  toggleAutoReply: (
    conversationId: string,
    enabled: boolean,
  ): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("conversation:toggle-auto-reply", { conversationId, enabled }),
};

contextBridge.exposeInMainWorld("moonchat", api);
