import { desc, eq, inArray } from "drizzle-orm";
import type { DatabaseService } from "../storage/databaseService.js";
import type { MemoryService } from "../memory/memoryService.js";
import type { ConversationService } from "../storage/conversationService.js";
import { learningJobs, messages } from "../../../src/shared/db/schema.js";
import type { LangChainAiService } from "../ai/langChainAiService.js";

export class LearningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly memory: MemoryService,
    private readonly conversations: ConversationService,
    private readonly langChainAi: LangChainAiService,
  ) {}

  async triggerConversationLearning(conversationId: string) {
    const [job] = await this.database.db
      .insert(learningJobs)
      .values({
        jobType: "conversation_summary",
        status: "running",
        triggerMode: "manual",
        targetConversationId: conversationId,
      })
      .returning();

    try {
      const conversation = await this.conversations.getConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      const recentMessages = await this.database.db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          externalMessageId: messages.externalMessageId,
          role: messages.messageRole,
          text: messages.contentText,
          senderType: messages.senderType,
          senderId: messages.senderId,
          sourceType: messages.sourceType,
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
        .orderBy(desc(messages.createdAt))
        .limit(30);

      const ordered = recentMessages
        .reverse()
        .map((message) => ({
          id: message.id,
          conversationId: message.conversationId,
          externalMessageId: message.externalMessageId,
          senderType: message.senderType,
          senderId: message.senderId,
          sourceType: message.sourceType,
          messageRole: message.role,
          contentText: message.text,
          contentType: message.contentType,
          attachmentImageDataUrl: message.attachmentImageDataUrl,
          attachmentMimeType: message.attachmentMimeType,
          replyToMessageId: message.replyToMessageId,
          isDeleted: Boolean(message.isDeleted),
          editedAt: message.editedAt,
          createdAt: message.createdAt,
        }));

      const artifacts = await this.langChainAi.generateLearningArtifacts({
        conversationTitle: conversation.title,
        participantLabel: conversation.participantLabel ?? conversation.externalUserId,
        recentMessages: ordered,
      });

      await this.memory.upsertConversationSummary(conversationId, artifacts.summary);
      await this.memory.upsertUserProfile(conversation.externalUserId, artifacts.userProfile);
      await this.memory.upsertUserKeyFacts(conversation.externalUserId, artifacts.keyFacts);
      await this.memory.upsertUserStrategy(conversation.externalUserId, artifacts.strategyNotes);

      await this.database.db
        .update(learningJobs)
        .set({ status: "completed", updatedAt: new Date().toISOString() })
        .where(eq(learningJobs.id, job.id));
    } catch (error) {
      await this.database.db
        .update(learningJobs)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "Unknown learning error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(learningJobs.id, job.id));
      throw error;
    }
  }
}
