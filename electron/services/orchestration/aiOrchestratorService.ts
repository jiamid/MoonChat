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
}
