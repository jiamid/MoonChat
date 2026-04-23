import type { DatabaseService } from "../storage/databaseService.js";
import type { MemoryService } from "../memory/memoryService.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { LangChainAiService } from "../ai/langChainAiService.js";
import { aiReplyLogs } from "../../../src/shared/db/schema.js";
import type { AppSettings } from "../../../src/shared/contracts.js";

export class AiOrchestratorService {
  constructor(
    private readonly database: DatabaseService,
    private readonly memory: MemoryService,
    private readonly conversations: ConversationService,
    private readonly langChainAi: LangChainAiService,
  ) {}

  reconfigure(settings: AppSettings["ai"]) {
    this.langChainAi.configure(settings);
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

    try {
      const reply = await this.langChainAi.generateAutoReply({
        conversationTitle: conversation.title,
        inboundText: input.inboundText,
        memoryContext: context,
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
          memoryContext: context,
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
          memoryContext: context,
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
  }) {
    const conversation = await this.conversations.getConversation(input.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found.");
    }

    const recentMessages = (await this.conversations.listMessages(input.conversationId))
      .filter((message) => !message.isDeleted)
      .slice(-16);

    const context = await this.memory.buildAiContext({
      conversationId: input.conversationId,
      userId: conversation.externalUserId,
    });

    const reply = await this.langChainAi.generateAutoReply({
      conversationTitle: conversation.title,
      inboundText: input.inboundText,
      memoryContext: [
        "这是本地 AI 策略助手会话。用户会通过这里调整你的基础策略、回复语气、知识记忆和运营规则。",
        context || "暂无既有记忆。",
      ].join("\n\n"),
      recentMessages,
    });

    if (!reply?.trim()) {
      throw new Error("AI did not return a reply. Please check AI settings.");
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
        memoryContext: context,
        recentMessages,
        mode: "local_ai_chat",
      }),
      responseSnapshot: reply.trim(),
      status: "completed",
    });

    return reply.trim();
  }
}
