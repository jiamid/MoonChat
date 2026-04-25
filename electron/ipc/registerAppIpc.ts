import { ipcMain } from "electron";
import type { AppRuntime } from "../services/runtime.js";
import type { ChannelConfig } from "../../src/shared/contracts.js";

export function registerAppIpc(runtime: AppRuntime) {
  ipcMain.handle("app:get-dashboard-snapshot", async () => runtime.dashboard.getSnapshot());
  ipcMain.handle("settings:get", async () => runtime.getSettings());
  ipcMain.handle("settings:update", async (_event, settings) => runtime.updateSettings(settings));
  ipcMain.handle("telegram-user:request-code", async (_event, channel: ChannelConfig) =>
    runtime.telegramUser.requestLoginCode(channel),
  );
  ipcMain.handle("whatsapp:request-qr", async (_event, channel: ChannelConfig) =>
    runtime.whatsapp.requestQr(channel),
  );
  ipcMain.handle("whatsapp:get-status", async (_event, channelId: string) =>
    runtime.whatsapp.getConnectionStatus(channelId),
  );
  ipcMain.handle("channel:get-status", async (_event, channel: ChannelConfig) =>
    runtime.getChannelStatus(channel),
  );
  ipcMain.handle("memory:list-relevant", async (_event, payload: { conversationId?: string; userId?: string }) =>
    runtime.memory.listRelevantMemories(payload),
  );
  ipcMain.handle("memory:get-global-ai", async () => runtime.memory.getGlobalAiMemories());
  ipcMain.handle(
    "memory:update-global-ai",
    async (
      _event,
      payload: { memoryType: "base" | "style" | "knowledge"; content: string; summary: string },
    ) => {
      await runtime.memory.upsertGlobalAiMemory(payload);
      return { ok: true };
    },
  );
  ipcMain.handle("conversation:list", async () => runtime.conversations.list());
  ipcMain.handle("conversation:get-messages", async (_event, conversationId: string) =>
    runtime.conversations.listMessages(conversationId),
  );
  ipcMain.handle(
    "conversation:send-manual-message",
    async (
      _event,
      payload: {
        conversationId: string;
        text: string;
        imageDataUrl?: string;
        imageMimeType?: string;
      },
    ) => {
      const conversation = await runtime.conversations.getConversation(payload.conversationId);
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      if (payload.imageDataUrl && conversation.channelType !== "local_ai") {
        throw new Error("当前只有 AI 助手支持图片发送。");
      }

      if (conversation.channelType === "telegram" && conversation.externalChatId) {
        const sent = await runtime.telegram.sendManualMessage(
          conversation.channelId,
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

      if (conversation.channelType === "telegram_user" && conversation.externalChatId) {
        const sent = await runtime.telegramUser.sendManualMessage(
          conversation.channelId,
          conversation.externalChatId,
          payload.text,
        );

        await runtime.conversations.createHumanReply({
          conversationId: payload.conversationId,
          senderId: "local-human",
          text: payload.text,
          sourceType: "telegram_user",
          externalMessageId: String(sent.id),
        });

        return { ok: true, externalMessageId: String(sent.id) };
      }

      if (conversation.channelType === "whatsapp_personal" && conversation.externalChatId) {
        const sent = await runtime.whatsapp.sendManualMessage(
          conversation.channelId,
          conversation.externalChatId,
          payload.text,
        );

        await runtime.conversations.createHumanReply({
          conversationId: payload.conversationId,
          senderId: "local-human",
          text: payload.text,
          sourceType: "whatsapp_personal",
          externalMessageId: sent?.key.id ?? undefined,
        });

        return { ok: true, externalMessageId: sent?.key.id };
      }

      if (conversation.channelType === "local_ai") {
        await runtime.conversations.createLocalUserMessage({
          conversationId: payload.conversationId,
          senderId: "local-human",
          text: payload.text,
          attachmentImageDataUrl: payload.imageDataUrl,
          attachmentMimeType: payload.imageMimeType,
        });
        await runtime.ai.handleLocalAiChat({
          conversationId: payload.conversationId,
          inboundText: payload.text,
          imageDataUrl: payload.imageDataUrl,
          imageMimeType: payload.imageMimeType,
        });
        return { ok: true };
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
      const existing = await runtime.conversations.getMessage(payload.messageId);
      if (!existing) {
        throw new Error("Message not found.");
      }

      if (
        existing.sourceType === "telegram" &&
        existing.externalMessageId
      ) {
        const conversation = await runtime.conversations.getConversation(existing.conversationId);
        if (!conversation?.externalChatId) {
          throw new Error("Telegram conversation not found.");
        }

        await runtime.telegram.editMessage(
          conversation.channelId,
          conversation.externalChatId,
          existing.externalMessageId,
          payload.nextText,
        );
      }

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
  ipcMain.handle(
    "conversation:clear-messages",
    async (_event, payload: { conversationId: string }) => {
      await runtime.conversations.clearConversationMessages(payload.conversationId);
      return { ok: true };
    },
  );
  ipcMain.handle(
    "conversation:update-participant-label",
    async (_event, payload: { conversationId: string; participantLabel: string }) => {
      await runtime.conversations.updateParticipantLabel({
        conversationId: payload.conversationId,
        participantLabel: payload.participantLabel.trim() || null,
      });
      return { ok: true };
    },
  );
  ipcMain.handle("learning:trigger", async (_event, conversationId: string) => {
    return runtime.learning.triggerConversationLearning(conversationId);
  });
  ipcMain.handle(
    "conversation:toggle-auto-reply",
    async (_event, payload: { conversationId: string; enabled: boolean }) => {
      await runtime.conversations.setAutoReply(payload.conversationId, payload.enabled);
      return { ok: true };
    },
  );
}
