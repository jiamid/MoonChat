import { and, asc, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import type { DatabaseService } from "./databaseService.js";
import {
  conversationAiSettings,
  conversations,
  learningJobs,
  messageDeletions,
  messageEdits,
  messages,
  memories,
} from "../../../src/shared/db/schema.js";
import type {
  ConversationMessage,
  ConversationMessagePage,
  ConversationSummary,
} from "../../../src/shared/contracts.js";

export class ConversationService {
  private readonly listeners = new Set<(payload: { conversationId: string | null }) => void>();

  constructor(private readonly database: DatabaseService) {}

  onChanged(listener: (payload: { conversationId: string | null }) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notifyChanged(conversationId: string | null) {
    this.emitChanged(conversationId);
  }

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
        channelId: conversations.channelId,
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

    const [summaryMemories, runningJobs] = await Promise.all([
      this.database.db.query.memories.findMany({
        where: and(
          eq(memories.memoryScope, "conversation"),
          eq(memories.memoryType, "summary"),
        ),
      }),
      this.database.db.query.learningJobs.findMany({
        where: eq(learningJobs.status, "running"),
      }),
    ]);

    const summaryByConversationId = new Map(
      summaryMemories.map((memory) => [memory.scopeRefId, memory.updatedAt] as const),
    );
    const runningConversationIds = new Set(
      runningJobs
        .map((job) => job.targetConversationId)
        .filter((conversationId): conversationId is string => Boolean(conversationId)),
    );

    return rows.map((row) => ({
      ...row,
      autoReplyEnabled: Boolean(row.autoReplyEnabled),
      learningStatus: runningConversationIds.has(row.id)
        ? "running"
        : summaryByConversationId.has(row.id)
          ? "learned"
          : "idle",
      learnedAt: summaryByConversationId.get(row.id) ?? null,
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
        attachmentDataUrl: messages.attachmentDataUrl,
        attachmentKind: messages.attachmentKind,
        attachmentMimeType: messages.attachmentMimeType,
        attachmentFileName: messages.attachmentFileName,
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

  async listMessagePage(input: {
    conversationId: string;
    beforeCreatedAt?: string;
    limit?: number;
  }): Promise<ConversationMessagePage> {
    const limit = Math.min(Math.max(input.limit ?? 80, 1), 300);
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
        attachmentDataUrl: messages.attachmentDataUrl,
        attachmentKind: messages.attachmentKind,
        attachmentMimeType: messages.attachmentMimeType,
        attachmentFileName: messages.attachmentFileName,
        replyToMessageId: messages.replyToMessageId,
        isDeleted: messages.isDeleted,
        editedAt: messages.editedAt,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        input.beforeCreatedAt
          ? and(
              eq(messages.conversationId, input.conversationId),
              lt(messages.createdAt, input.beforeCreatedAt),
            )
          : eq(messages.conversationId, input.conversationId),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    return {
      messages: rows
        .slice(0, limit)
        .reverse()
        .map((row) => ({
          ...row,
          isDeleted: Boolean(row.isDeleted),
        })),
      hasMore: rows.length > limit,
    };
  }

  async countUnreadMessages(
    readStates: Array<{ conversationId: string; readAt?: string | null }>,
  ): Promise<Record<string, number>> {
    const entries = await Promise.all(
      readStates.map(async ({ conversationId, readAt }) => {
        const [row] = await this.database.db
          .select({ value: count() })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              eq(messages.messageRole, "inbound"),
              eq(messages.isDeleted, 0),
              gt(messages.createdAt, readAt || "1970-01-01T00:00:00.000Z"),
            ),
          );

        return [conversationId, row?.value ?? 0] as const;
      }),
    );

    return Object.fromEntries(entries);
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
      this.emitChanged(conversationId);
      return;
    }

    await this.database.db.insert(conversationAiSettings).values({
      conversationId,
      autoReplyEnabled: enabled ? 1 : 0,
      replyMode: "manual",
    });
    this.emitChanged(conversationId);
  }

  async appendInboundTelegramMessage(input: {
    conversationId: string;
    externalMessageId: string;
    senderId: string;
    text: string;
    sourceType?: string;
    attachmentImageDataUrl?: string;
    attachmentDataUrl?: string;
    attachmentKind?: string;
    attachmentMimeType?: string;
    attachmentFileName?: string;
    replyToMessageId?: string;
  }) {
    const attachment = normalizeAttachment(input);
    await this.database.db.insert(messages).values({
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      senderType: "user",
      senderId: input.senderId,
      sourceType: input.sourceType ?? "telegram",
      contentText: input.text,
      contentType: attachment.contentType,
      attachmentImageDataUrl: attachment.imageDataUrl,
      attachmentDataUrl: attachment.dataUrl,
      attachmentKind: attachment.kind,
      attachmentMimeType: attachment.mimeType,
      attachmentFileName: attachment.fileName,
      replyToMessageId: input.replyToMessageId,
      messageRole: "inbound",
    });

    await this.touchConversation(input.conversationId);
  }

  async upsertTelegramUserMessage(input: {
    conversationId: string;
    externalMessageId: string;
    senderId: string;
    text: string;
    messageRole: "inbound" | "outbound";
    senderType: "user" | "human_agent";
    createdAt?: string;
    attachmentImageDataUrl?: string;
    attachmentDataUrl?: string;
    attachmentKind?: string;
    attachmentMimeType?: string;
    attachmentFileName?: string;
    replyToMessageId?: string;
  }) {
    const existing = await this.database.db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.externalMessageId, input.externalMessageId),
      ),
    });
    const now = new Date().toISOString();
    const attachment = normalizeAttachment(input);

    if (existing) {
      if (
        !existing.isDeleted &&
        (existing.contentText !== input.text ||
          existing.attachmentDataUrl !== (attachment.dataUrl ?? null) ||
          existing.attachmentImageDataUrl !== (attachment.imageDataUrl ?? null) ||
          existing.replyToMessageId !== (input.replyToMessageId ?? null))
      ) {
        await this.database.db
          .update(messages)
          .set({
            contentText: input.text,
            contentType: attachment.contentType,
            attachmentImageDataUrl: attachment.imageDataUrl,
            attachmentDataUrl: attachment.dataUrl,
            attachmentKind: attachment.kind,
            attachmentMimeType: attachment.mimeType,
            attachmentFileName: attachment.fileName,
            replyToMessageId: input.replyToMessageId,
            editedAt: now,
          })
          .where(eq(messages.id, existing.id));
      }
      await this.touchConversation(input.conversationId);
      return;
    }

    if (input.messageRole === "outbound") {
      const pendingAiReply = await this.database.db.query.messages.findFirst({
        where: and(
          eq(messages.conversationId, input.conversationId),
          isNull(messages.externalMessageId),
          eq(messages.messageRole, "outbound"),
          eq(messages.senderType, "ai_agent"),
          eq(messages.sourceType, "moonchat_ai"),
          eq(messages.contentText, input.text),
        ),
        orderBy: [desc(messages.createdAt)],
      });

      if (pendingAiReply && !pendingAiReply.isDeleted) {
        await this.database.db
          .update(messages)
          .set({
            externalMessageId: input.externalMessageId,
            contentText: input.text,
            contentType: attachment.contentType,
            attachmentImageDataUrl: attachment.imageDataUrl,
            attachmentDataUrl: attachment.dataUrl,
            attachmentKind: attachment.kind,
            attachmentMimeType: attachment.mimeType,
            attachmentFileName: attachment.fileName,
            replyToMessageId: input.replyToMessageId,
            editedAt: now,
          })
          .where(eq(messages.id, pendingAiReply.id));
        await this.touchConversation(input.conversationId);
        return;
      }
    }

    await this.database.db.insert(messages).values({
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      senderType: input.senderType,
      senderId: input.senderId,
      sourceType: "telegram_user",
      contentText: input.text,
      contentType: attachment.contentType,
      attachmentImageDataUrl: attachment.imageDataUrl,
      attachmentDataUrl: attachment.dataUrl,
      attachmentKind: attachment.kind,
      attachmentMimeType: attachment.mimeType,
      attachmentFileName: attachment.fileName,
      replyToMessageId: input.replyToMessageId,
      messageRole: input.messageRole,
      createdAt: input.createdAt,
    });

    await this.touchConversation(input.conversationId);
  }

  async attachExternalMessageIdToMessage(input: {
    messageId: string;
    externalMessageId: string;
    sourceType?: string;
  }) {
    const existing = await this.database.db.query.messages.findFirst({
      where: eq(messages.id, input.messageId),
    });

    if (!existing || existing.isDeleted) {
      return;
    }

    await this.database.db
      .update(messages)
      .set({
        externalMessageId: input.externalMessageId,
        sourceType: input.sourceType ?? existing.sourceType,
      })
      .where(eq(messages.id, input.messageId));

    await this.touchConversation(existing.conversationId);
  }

  async upsertInboundTelegramMessageEdit(input: {
    conversationId: string;
    externalMessageId: string;
    senderId: string;
    text: string;
    replyToMessageId?: string;
  }) {
    const existing = await this.database.db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, input.conversationId),
        eq(messages.externalMessageId, input.externalMessageId),
      ),
    });

    if (!existing) {
      await this.appendInboundTelegramMessage(input);
      return;
    }

    if (existing.isDeleted) {
      return;
    }

    await this.database.db.insert(messageEdits).values({
      messageId: existing.id,
      previousText: existing.contentText,
      editedBy: input.senderId,
    });

    await this.database.db
      .update(messages)
      .set({
        contentText: input.text,
        replyToMessageId: input.replyToMessageId,
        editedAt: new Date().toISOString(),
      })
      .where(eq(messages.id, existing.id));

    await this.touchConversation(input.conversationId);
  }

  async createLocalUserMessage(input: {
    conversationId: string;
    senderId: string;
    text: string;
    attachmentImageDataUrl?: string;
    attachmentDataUrl?: string;
    attachmentKind?: string;
    attachmentMimeType?: string;
    attachmentFileName?: string;
  }) {
    const attachment = normalizeAttachment(input);
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        senderType: "user",
        sourceType: "local_ai",
        contentText: input.text,
        contentType: attachment.contentType,
        attachmentImageDataUrl: attachment.imageDataUrl,
        attachmentDataUrl: attachment.dataUrl,
        attachmentKind: attachment.kind,
        attachmentMimeType: attachment.mimeType,
        attachmentFileName: attachment.fileName,
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
    attachmentDataUrl?: string;
    attachmentKind?: string;
    attachmentMimeType?: string;
    attachmentFileName?: string;
  }) {
    const attachment = normalizeAttachment(input);
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        externalMessageId: input.externalMessageId,
        senderId: input.senderId,
        senderType: "human_agent",
        sourceType: input.sourceType ?? "moonchat_human",
        contentText: input.text,
        contentType: attachment.contentType,
        attachmentImageDataUrl: attachment.imageDataUrl,
        attachmentDataUrl: attachment.dataUrl,
        attachmentKind: attachment.kind,
        attachmentMimeType: attachment.mimeType,
        attachmentFileName: attachment.fileName,
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

  async getMessage(messageId: string) {
    return this.database.db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
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
    attachmentDataUrl?: string;
    attachmentKind?: string;
    attachmentMimeType?: string;
    attachmentFileName?: string;
  }) {
    const attachment = normalizeAttachment(input);
    const [message] = await this.database.db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        externalMessageId: input.externalMessageId,
        senderId: input.senderId,
        senderType: "ai_agent",
        sourceType: "moonchat_ai",
        contentText: input.text,
        contentType: attachment.contentType,
        attachmentImageDataUrl: attachment.imageDataUrl,
        attachmentDataUrl: attachment.dataUrl,
        attachmentKind: attachment.kind,
        attachmentMimeType: attachment.mimeType,
        attachmentFileName: attachment.fileName,
        messageRole: "outbound",
      })
      .returning();

    await this.touchConversation(input.conversationId);
    return message;
  }

  async findOrCreateTelegramConversation(input: {
    channelId: string;
    chatId: string;
    title: string;
    externalUserId: string;
    username?: string | null;
  }) {
    const existing = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(conversations.channelType, "telegram"),
        or(eq(conversations.channelId, input.channelId), isNull(conversations.channelId)),
        eq(conversations.externalChatId, input.chatId),
      ),
    });

    if (existing) {
      await this.database.db
        .update(conversations)
        .set({
          title: input.title,
          channelId: input.channelId,
          externalUserId: input.externalUserId,
          participantLabel: input.username ?? input.title,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(conversations.id, existing.id));
      this.emitChanged(existing.id);
      return existing;
    }

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        title: input.title,
        channelType: "telegram",
        channelId: input.channelId,
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

    this.emitChanged(conversation.id);
    return conversation;
  }

  async findOrCreateTelegramUserConversation(input: {
    channelId: string;
    chatId: string;
    title: string;
    externalUserId: string;
    username?: string | null;
  }) {
    const existing = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(conversations.channelType, "telegram_user"),
        or(eq(conversations.channelId, input.channelId), isNull(conversations.channelId)),
        eq(conversations.externalChatId, input.chatId),
      ),
    });

    if (existing) {
      await this.database.db
        .update(conversations)
        .set({
          title: input.title,
          channelId: input.channelId,
          externalUserId: input.externalUserId,
          participantLabel: input.username ?? input.title,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(conversations.id, existing.id));
      this.emitChanged(existing.id);
      return existing;
    }

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        title: input.title,
        channelType: "telegram_user",
        channelId: input.channelId,
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

    this.emitChanged(conversation.id);
    return conversation;
  }

  async findOrCreateWhatsappConversation(input: {
    channelId: string;
    chatId: string;
    title: string;
    externalUserId: string;
  }) {
    const existing = await this.database.db.query.conversations.findFirst({
      where: and(
        eq(conversations.channelType, "whatsapp_personal"),
        or(eq(conversations.channelId, input.channelId), isNull(conversations.channelId)),
        eq(conversations.externalChatId, input.chatId),
      ),
    });

    if (existing) {
      await this.database.db
        .update(conversations)
        .set({
          title: input.title,
          channelId: input.channelId,
          externalUserId: input.externalUserId,
          participantLabel: input.title,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(conversations.id, existing.id));
      this.emitChanged(existing.id);
      return existing;
    }

    const [conversation] = await this.database.db
      .insert(conversations)
      .values({
        title: input.title,
        channelType: "whatsapp_personal",
        channelId: input.channelId,
        externalChatId: input.chatId,
        externalUserId: input.externalUserId,
        participantLabel: input.title,
      })
      .returning();

    await this.database.db.insert(conversationAiSettings).values({
      conversationId: conversation.id,
      autoReplyEnabled: 0,
      replyMode: "manual",
    });

    this.emitChanged(conversation.id);
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

  async updateParticipantLabel(input: {
    conversationId: string;
    participantLabel: string | null;
  }) {
    await this.database.db
      .update(conversations)
      .set({
        participantLabel: input.participantLabel,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, input.conversationId));

    this.emitChanged(input.conversationId);
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
    this.emitChanged(conversationId);
  }

  private emitChanged(conversationId: string | null) {
    for (const listener of this.listeners) {
      listener({ conversationId });
    }
  }
}

type AttachmentInput = {
  attachmentImageDataUrl?: string;
  attachmentDataUrl?: string;
  attachmentKind?: string;
  attachmentMimeType?: string;
  attachmentFileName?: string;
};

function normalizeAttachment(input: AttachmentInput) {
  const dataUrl = input.attachmentDataUrl ?? input.attachmentImageDataUrl;
  const mimeType = input.attachmentMimeType ?? getDataUrlMimeType(dataUrl);
  const kind = input.attachmentKind ?? inferAttachmentKind(mimeType, input.attachmentImageDataUrl);
  const imageDataUrl = kind === "image" ? dataUrl : input.attachmentImageDataUrl;

  return {
    dataUrl,
    imageDataUrl,
    kind,
    mimeType,
    fileName: input.attachmentFileName,
    contentType: dataUrl ? `text_${kind ?? "file"}` : "text",
  };
}

function inferAttachmentKind(mimeType: string | undefined, imageDataUrl?: string) {
  if (imageDataUrl || mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  if (mimeType) {
    return "file";
  }
  return undefined;
}

function getDataUrlMimeType(dataUrl: string | undefined) {
  return dataUrl?.match(/^data:([^;]+);base64,/)?.[1];
}
