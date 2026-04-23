import { and, asc, desc, eq } from "drizzle-orm";
import type { DatabaseService } from "./databaseService.js";
import {
  conversationAiSettings,
  conversations,
  messageDeletions,
  messageEdits,
  messages,
} from "../../../src/shared/db/schema.js";
import type {
  ConversationMessage,
  ConversationSummary,
} from "../../../src/shared/contracts.js";

export class ConversationService {
  constructor(private readonly database: DatabaseService) {}

  async ensureLocalAiConversation() {
    const existing = await this.database.db.query.conversations.findFirst({
      where: eq(conversations.channelType, "local_ai"),
    });

    if (existing) {
      return existing;
    }

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        title: "AI 策略助手",
        channelType: "local_ai",
        externalChatId: "local-ai",
        externalUserId: "local-ai-user",
        participantLabel: "本地 AI",
      })
      .returning();

    await this.database.db.insert(conversationAiSettings).values({
      conversationId: conversation.id,
      autoReplyEnabled: 1,
      replyMode: "auto",
    });

    return conversation;
  }

  async list(): Promise<ConversationSummary[]> {
    await this.ensureLocalAiConversation();

    const rows = await this.database.db
      .select({
        id: conversations.id,
        title: conversations.title,
        channelType: conversations.channelType,
        externalUserId: conversations.externalUserId,
        externalChatId: conversations.externalChatId,
        participantLabel: conversations.participantLabel,
        autoReplyEnabled: conversationAiSettings.autoReplyEnabled,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .leftJoin(
        conversationAiSettings,
        eq(conversationAiSettings.conversationId, conversations.id),
      )
      .orderBy(desc(conversations.updatedAt));

    return rows.map((row) => ({
      ...row,
      autoReplyEnabled: Boolean(row.autoReplyEnabled),
    }));
  }

  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const rows = await this.database.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        externalMessageId: messages.externalMessageId,
        senderType: messages.senderType,
        senderId: messages.senderId,
        sourceType: messages.sourceType,
        messageRole: messages.messageRole,
        contentText: messages.contentText,
        contentType: messages.contentType,
        attachmentImageDataUrl: messages.attachmentImageDataUrl,
        attachmentMimeType: messages.attachmentMimeType,
        replyToMessageId: messages.replyToMessageId,
        isDeleted: messages.isDeleted,
        editedAt: messages.editedAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return rows.map((row) => ({
      ...row,
      isDeleted: Boolean(row.isDeleted),
    }));
  }

  async setAutoReply(conversationId: string, enabled: boolean) {
    const existing = await this.database.db.query.conversationAiSettings.findFirst({
      where: eq(conversationAiSettings.conversationId, conversationId),
    });

    if (existing) {
      await this.database.db
        .update(conversationAiSettings)
        .set({ autoReplyEnabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
        .where(eq(conversationAiSettings.conversationId, conversationId));
      return;
    }

    await this.database.db.insert(conversationAiSettings).values({
      conversationId,
      autoReplyEnabled: enabled ? 1 : 0,
      replyMode: "manual",
    });
  }

  async appendInboundTelegramMessage(input: {
    conversationId: string;
    externalMessageId: string;
    senderId: string;
    text: string;
  }) {
    await this.database.db.insert(messages).values({
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      senderType: "user",
      senderId: input.senderId,
      sourceType: "telegram",
      contentText: input.text,
      contentType: "text",
      messageRole: "inbound",
    });

    await this.touchConversation(input.conversationId);
  }

  async createLocalUserMessage(input: {
    conversationId: string;
    senderId: string;
    text: string;
    attachmentImageDataUrl?: string;
    attachmentMimeType?: string;
  }) {
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        senderType: "user",
        sourceType: "local_ai",
        contentText: input.text,
        contentType: input.attachmentImageDataUrl ? "text_image" : "text",
        attachmentImageDataUrl: input.attachmentImageDataUrl,
        attachmentMimeType: input.attachmentMimeType,
        messageRole: "inbound",
      })
      .returning();

    await this.touchConversation(input.conversationId);
    return message;
  }

  async createHumanReply(input: {
    conversationId: string;
    senderId: string;
    text: string;
    sourceType?: string;
    externalMessageId?: string;
    attachmentImageDataUrl?: string;
    attachmentMimeType?: string;
  }) {
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        externalMessageId: input.externalMessageId,
        senderId: input.senderId,
        senderType: "human_agent",
        sourceType: input.sourceType ?? "moonchat_human",
        contentText: input.text,
        contentType: input.attachmentImageDataUrl ? "text_image" : "text",
        attachmentImageDataUrl: input.attachmentImageDataUrl,
        attachmentMimeType: input.attachmentMimeType,
        messageRole: "outbound",
      })
      .returning();

    await this.touchConversation(input.conversationId);
    return message;
  }

  async updateMessage(input: {
    messageId: string;
    editorId: string;
    nextText: string;
  }) {
    const existing = await this.database.db.query.messages.findFirst({
      where: eq(messages.id, input.messageId),
    });

    if (!existing || existing.isDeleted) {
      throw new Error("Message not found or already deleted.");
    }

    await this.database.db.insert(messageEdits).values({
      messageId: existing.id,
      previousText: existing.contentText,
      editedBy: input.editorId,
    });

    await this.database.db
      .update(messages)
      .set({
        contentText: input.nextText,
        editedAt: new Date().toISOString(),
      })
      .where(eq(messages.id, input.messageId));

    await this.touchConversation(existing.conversationId);
  }

  async deleteMessage(input: {
    messageId: string;
    deletedBy: string;
    reason?: string;
  }) {
    const existing = await this.database.db.query.messages.findFirst({
      where: eq(messages.id, input.messageId),
    });

    if (!existing || existing.isDeleted) {
      throw new Error("Message not found or already deleted.");
    }

    await this.database.db.insert(messageDeletions).values({
      messageId: existing.id,
      deletedBy: input.deletedBy,
      reason: input.reason,
    });

    await this.database.db
      .update(messages)
      .set({
        isDeleted: 1,
        contentText: "[已删除]",
      })
      .where(eq(messages.id, input.messageId));

    await this.touchConversation(existing.conversationId);
  }

  async appendAiReply(input: {
    conversationId: string;
    senderId: string;
    text: string;
    externalMessageId?: string;
    attachmentImageDataUrl?: string;
    attachmentMimeType?: string;
  }) {
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        externalMessageId: input.externalMessageId,
        senderId: input.senderId,
        senderType: "ai_agent",
        sourceType: "moonchat_ai",
        contentText: input.text,
        contentType: input.attachmentImageDataUrl ? "text_image" : "text",
        attachmentImageDataUrl: input.attachmentImageDataUrl,
        attachmentMimeType: input.attachmentMimeType,
        messageRole: "outbound",
      })
      .returning();

    await this.touchConversation(input.conversationId);
    return message;
  }

  async findOrCreateTelegramConversation(input: {
    chatId: string;
    title: string;
    externalUserId: string;
    username?: string | null;
  }) {
    const existing = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(conversations.channelType, "telegram"),
        eq(conversations.externalUserId, input.externalUserId),
      ),
    });

    if (existing) {
      return existing;
    }

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        title: input.title,
        channelType: "telegram",
        externalChatId: input.chatId,
        externalUserId: input.externalUserId,
        participantLabel: input.username ?? input.title,
      })
      .returning();

    await this.database.db.insert(conversationAiSettings).values({
      conversationId: conversation.id,
      autoReplyEnabled: 0,
      replyMode: "manual",
    });

    return conversation;
  }

  async isAutoReplyEnabled(conversationId: string) {
    const setting = await this.database.db.query.conversationAiSettings.findFirst({
      where: eq(conversationAiSettings.conversationId, conversationId),
    });
    return Boolean(setting?.autoReplyEnabled);
  }

  async getConversation(conversationId: string) {
    return this.database.db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
  }

  async clearConversationMessages(conversationId: string) {
    await this.database.db.delete(messages).where(eq(messages.conversationId, conversationId));
    await this.touchConversation(conversationId);
  }

  private async touchConversation(conversationId: string) {
    await this.database.db
      .update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId));
  }
}
