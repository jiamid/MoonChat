import type { DatabaseService } from "../storage/databaseService.js";
import type { MemoryService } from "../memory/memoryService.js";
import type { RagService } from "../rag/ragService.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { LangChainAiService } from "../ai/langChainAiService.js";
import { aiReplyLogs } from "../../../src/shared/db/schema.js";
import type { AppSettings } from "../../../src/shared/contracts.js";

export class AiOrchestratorService {
  private assistantConversationSender:
    | ((input: { conversationId: string; text: string }) => Promise<{ channelType: string }>)
    | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly memory: MemoryService,
    private readonly rag: RagService,
    private readonly conversations: ConversationService,
    private readonly langChainAi: LangChainAiService,
  ) {}

  reconfigure(settings: AppSettings["ai"]) {
    this.langChainAi.configure(settings);
  }

  setAssistantConversationSender(
    sender: (input: { conversationId: string; text: string }) => Promise<{ channelType: string }>,
  ) {
    this.assistantConversationSender = sender;
  }

  async handlePotentialAutoReply(input: {
    conversationId: string;
    senderId: string;
    inboundText: string;
  }) {
    const enabled = await this.conversations.isAutoReplyEnabled(input.conversationId);
    if (!enabled) {
      return null;
    }

    const conversation = await this.conversations.getConversation(input.conversationId);
    if (!conversation) {
      return null;
    }

    const recentMessages = (await this.conversations.listMessages(input.conversationId))
      .filter((message) => !message.isDeleted)
      .slice(-12);

    const context = await this.memory.buildAiContext({
      conversationId: input.conversationId,
      userId: conversation.externalUserId,
    });
    const ragContext = await this.rag.buildContext(input.inboundText, 5);

    try {
      const reply = await this.langChainAi.generateAutoReply({
        conversationTitle: conversation.title,
        inboundText: input.inboundText,
        memoryContext: [context, ragContext ? `相关知识库:\n${ragContext}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        recentMessages,
      });

      if (!reply?.trim()) {
        return null;
      }

      const outbound = await this.conversations.appendAiReply({
        conversationId: input.conversationId,
        senderId: "moonchat-ai",
        text: reply.trim(),
      });

      await this.database.db.insert(aiReplyLogs).values({
        conversationId: input.conversationId,
        inboundMessageId: recentMessages.at(-1)?.id,
        outboundMessageId: outbound.id,
        provider: this.langChainAi.getProviderName(),
        model: this.langChainAi.getModelName(),
        promptSnapshot: JSON.stringify({
          inboundText: input.inboundText,
          memoryContext: [context, ragContext ? `相关知识库:\n${ragContext}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          recentMessages,
        }),
        responseSnapshot: reply.trim(),
        status: "completed",
      });

      return reply.trim();
    } catch (error) {
      await this.database.db.insert(aiReplyLogs).values({
        conversationId: input.conversationId,
        inboundMessageId: recentMessages.at(-1)?.id,
        provider: this.langChainAi.getProviderName(),
        model: this.langChainAi.getModelName(),
        promptSnapshot: JSON.stringify({
          inboundText: input.inboundText,
          memoryContext: [context, ragContext ? `相关知识库:\n${ragContext}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          recentMessages,
        }),
        responseSnapshot: error instanceof Error ? error.message : "Unknown AI error",
        status: "failed",
      });
      throw error;
    }
  }

  async handleLocalAiChat(input: {
    conversationId: string;
    inboundText: string;
    imageDataUrl?: string;
    imageMimeType?: string;
  }) {
    const conversation = await this.conversations.getConversation(input.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const recentMessages = (await this.conversations.listMessages(input.conversationId))
      .filter((message) => !message.isDeleted)
      .slice(-16);
    const channelConversations = (await this.conversations.list()).filter(
      (item) => item.channelType !== "local_ai",
    );
    const channelStats = new Map<
      string,
      { conversationCount: number; users: Set<string> }
    >();
    for (const item of channelConversations) {
      const existing = channelStats.get(item.channelType) ?? {
        conversationCount: 0,
        users: new Set<string>(),
      };
      existing.conversationCount += 1;
      existing.users.add(item.externalUserId);
      channelStats.set(item.channelType, existing);
    }

    const conversationCatalog = await Promise.all(
      channelConversations.map(async (item) => ({
        id: item.id,
        title: item.title,
        channelType: item.channelType,
        externalUserId: item.externalUserId,
        externalChatId: item.externalChatId,
        participantLabel: item.participantLabel,
        autoReplyEnabled: item.autoReplyEnabled,
        learningStatus: item.learningStatus,
        learnedAt: item.learnedAt,
        updatedAt: item.updatedAt,
        memories: (await this.memory.listRelevantMemories({
          conversationId: item.id,
          userId: item.externalUserId,
        })).map((memory) => ({
          memoryScope: memory.memoryScope,
          memoryType: memory.memoryType,
          summary: memory.summary,
          content: memory.content,
          confidence: memory.confidence,
          updatedAt: memory.updatedAt,
        })),
      })),
    );

    const uniqueUserIds = Array.from(new Set(channelConversations.map((item) => item.externalUserId)));
    const userCatalog = await Promise.all(
      uniqueUserIds.map(async (externalUserId) => {
        const userConversations = channelConversations.filter(
          (item) => item.externalUserId === externalUserId,
        );
        const memories = await this.memory.listRelevantMemories({ userId: externalUserId });

        return {
          externalUserId,
          participantLabels: Array.from(
            new Set(
              userConversations
                .map((item) => item.participantLabel)
                .filter((value): value is string => Boolean(value)),
            ),
          ),
          channels: Array.from(new Set(userConversations.map((item) => item.channelType))),
          conversationIds: userConversations.map((item) => item.id),
          conversationTitles: userConversations.map((item) => item.title),
          memories: memories.map((memory) => ({
            memoryScope: memory.memoryScope,
            memoryType: memory.memoryType,
            summary: memory.summary,
            content: memory.content,
            confidence: memory.confidence,
            updatedAt: memory.updatedAt,
          })),
        };
      }),
    );

    const globalMemories = await this.memory.getGlobalAiMemories();
    const ragContext = await this.rag.buildContext(input.inboundText, 6);
    const replyResult = await this.langChainAi.generateAiAssistantResponse({
      userMessage: input.inboundText,
      recentMessages,
      baseMemory: findGlobalMemory(globalMemories, "base"),
      styleMemory: findGlobalMemory(globalMemories, "style"),
      knowledgeMemory: findGlobalMemory(globalMemories, "knowledge"),
      ragContext,
      conversationCatalog,
      userCatalog,
      workspaceOverview: {
        connectedChannels: Array.from(channelStats.keys()),
        conversationCount: channelConversations.length,
        userCount: new Set(channelConversations.map((item) => item.externalUserId)).size,
        channelBreakdown: Array.from(channelStats.entries()).map(([channelType, value]) => ({
          channelType,
          conversationCount: value.conversationCount,
          userCount: value.users.size,
        })),
      },
      sendConversationMessage: async ({ conversationId, externalUserId, keyword, channelType, text }) => {
        const normalizedKeyword = keyword?.trim().toLowerCase();
        const normalizedText = text.trim();

        if (!normalizedText) {
          return {
            ok: false,
            status: "not_found" as const,
            message: "消息内容不能为空。",
          };
        }

        let matches = conversationCatalog.filter((item) => item.channelType !== "local_ai");

        if (conversationId) {
          matches = matches.filter((item) => item.id === conversationId);
        }

        if (externalUserId) {
          matches = matches.filter((item) => item.externalUserId === externalUserId);
        }

        if (channelType) {
          matches = matches.filter((item) => item.channelType === channelType);
        }

        if (normalizedKeyword) {
          matches = matches.filter((item) =>
            [
              item.title,
              item.participantLabel ?? "",
              item.externalUserId,
              item.externalChatId ?? "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(normalizedKeyword),
          );
        }

        if (matches.length === 0) {
          return {
            ok: false,
            status: "not_found" as const,
            message: "没有找到匹配的会话，请提供更明确的会话名、备注、用户ID或渠道。",
          };
        }

        if (matches.length > 1) {
          return {
            ok: false,
            status: "ambiguous" as const,
            message: "匹配到了多个会话，暂时不能安全发送，请先明确指定目标。",
            candidates: matches.slice(0, 12).map((item) => ({
              id: item.id,
              title: item.title,
              channelType: item.channelType,
              externalUserId: item.externalUserId,
              participantLabel: item.participantLabel,
            })),
          };
        }

        const target = matches[0];
        if (!this.assistantConversationSender) {
          return {
            ok: false,
            status: "unsupported" as const,
            message: "当前运行时还没有接入发送能力。",
          };
        }

        const sent = await this.assistantConversationSender({
          conversationId: target.id,
          text: normalizedText,
        });

        return {
          ok: true,
          status: "sent" as const,
          message: `已发送到 ${target.title}（${sent.channelType}）`,
          candidates: [
            {
              id: target.id,
              title: target.title,
              channelType: target.channelType,
              externalUserId: target.externalUserId,
              participantLabel: target.participantLabel,
            },
          ],
        };
      },
      imageDataUrl: input.imageDataUrl,
    });

    if (!replyResult.reply?.trim()) {
      throw new Error("AI did not return a reply. Please check AI settings.");
    }

    for (const update of replyResult.memoryUpdates) {
      await this.memory.upsertGlobalAiMemory(update);
    }

    const outbound = await this.conversations.appendAiReply({
      conversationId: input.conversationId,
      senderId: "moonchat-ai",
      text: replyResult.reply.trim(),
    });

    await this.database.db.insert(aiReplyLogs).values({
      conversationId: input.conversationId,
      inboundMessageId: recentMessages.at(-1)?.id,
      outboundMessageId: outbound.id,
      provider: this.langChainAi.getProviderName(),
      model: this.langChainAi.getModelName(),
      promptSnapshot: JSON.stringify({
        inboundText: input.inboundText,
        imageDataUrl: input.imageDataUrl,
        recentMessages,
        mode: "local_ai_chat",
        memoryUpdates: replyResult.memoryUpdates,
      }),
      responseSnapshot: replyResult.reply.trim(),
      status: "completed",
    });

    return replyResult.reply.trim();
  }
}

function findGlobalMemory(memories: Awaited<ReturnType<MemoryService["getGlobalAiMemories"]>>, memoryType: string) {
  return memories.find((memory) => memory.memoryType === memoryType)?.content ?? "";
}
