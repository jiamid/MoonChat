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

    const globalMemories = await this.memory.getGlobalAiMemories();
    const replyResult = await this.langChainAi.generateAiAssistantResponse({
      userMessage: input.inboundText,
      recentMessages,
      baseMemory: findGlobalMemory(globalMemories, "base"),
      styleMemory: findGlobalMemory(globalMemories, "style"),
      knowledgeMemory: findGlobalMemory(globalMemories, "knowledge"),
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
