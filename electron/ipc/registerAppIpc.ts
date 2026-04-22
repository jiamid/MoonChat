import { ipcMain } from "electron";
import type { AppRuntime } from "../services/runtime.js";

export function registerAppIpc(runtime: AppRuntime) {
  ipcMain.handle("app:get-dashboard-snapshot", async () => runtime.dashboard.getSnapshot());
  ipcMain.handle("settings:get", async () => runtime.getSettings());
  ipcMain.handle("settings:update", async (_event, settings) => runtime.updateSettings(settings));
  ipcMain.handle("memory:list-relevant", async (_event, payload: { conversationId?: string; userId?: string }) =>
    runtime.memory.listRelevantMemories(payload),
  );
  ipcMain.handle("conversation:list", async () => runtime.conversations.list());
  ipcMain.handle("conversation:get-messages", async (_event, conversationId: string) =>
    runtime.conversations.listMessages(conversationId),
  );
  ipcMain.handle(
    "conversation:send-manual-message",
    async (_event, payload: { conversationId: string; text: string }) => {
      const conversation = await runtime.conversations.getConversation(payload.conversationId);
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      if (conversation.channelType === "telegram" && conversation.externalChatId) {
        const sent = await runtime.telegram.sendManualMessage(
          conversation.externalChatId,
          payload.text,
        );

        await runtime.conversations.createHumanReply({
          conversationId: payload.conversationId,
          senderId: "local-human",
          text: payload.text,
          sourceType: "telegram",
          externalMessageId: String(sent.message_id),
        });

        return { ok: true, externalMessageId: String(sent.message_id) };
      }

      await runtime.conversations.createHumanReply({
        conversationId: payload.conversationId,
        senderId: "local-human",
        text: payload.text,
      });

      return { ok: true };
    },
  );
  ipcMain.handle(
    "conversation:update-message",
    async (_event, payload: { messageId: string; nextText: string }) => {
      await runtime.conversations.updateMessage({
        messageId: payload.messageId,
        nextText: payload.nextText,
        editorId: "local-human",
      });
      return { ok: true };
    },
  );
  ipcMain.handle(
    "conversation:delete-message",
    async (_event, payload: { messageId: string }) => {
      await runtime.conversations.deleteMessage({
        messageId: payload.messageId,
        deletedBy: "local-human",
      });
      return { ok: true };
    },
  );
  ipcMain.handle("learning:trigger", async (_event, conversationId: string) => {
    await runtime.learning.triggerConversationLearning(conversationId);
    return { ok: true };
  });
  ipcMain.handle(
    "conversation:toggle-auto-reply",
    async (_event, payload: { conversationId: string; enabled: boolean }) => {
      await runtime.conversations.setAutoReply(payload.conversationId, payload.enabled);
      return { ok: true };
    },
  );
}
