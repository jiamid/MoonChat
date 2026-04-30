import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { DatabaseService } from "../storage/databaseService.js";
import type { MemoryService } from "../memory/memoryService.js";
import type { ConversationService } from "../storage/conversationService.js";
import { learningJobs, messages } from "../../../src/shared/db/schema.js";
import type {
  ExistingLearningArtifacts,
  LangChainAiService,
  LearningArtifacts,
} from "../ai/langChainAiService.js";
import type { AppSettings, MemoryEntry } from "../../../src/shared/contracts.js";

const LEARNING_BATCH_SIZE = 30;

export class LearningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly memory: MemoryService,
    private readonly conversations: ConversationService,
    private readonly langChainAi: LangChainAiService,
  ) {}

  reconfigure(settings: AppSettings["ai"]) {
    this.langChainAi.configure(settings);
  }

  async triggerConversationLearning(conversationId: string) {
    const runningJob = await this.database.db.query.learningJobs.findFirst({
      where: eq(learningJobs.targetConversationId, conversationId),
      orderBy: [desc(learningJobs.updatedAt)],
    });
    if (runningJob?.status === "running") {
      return { status: "running" as const };
    }

    const learnedThroughAt = await this.conversations.getLearnedThroughAt(conversationId);
    const latestMessage = learnedThroughAt
      ? await this.database.db.query.messages.findFirst({
          where: eq(messages.conversationId, conversationId),
          orderBy: [desc(messages.createdAt)],
        })
      : null;
    const existingLearnedThroughAt =
      learnedThroughAt && latestMessage && learnedThroughAt > latestMessage.createdAt
        ? latestMessage.createdAt
        : learnedThroughAt;

    if (learnedThroughAt) {
      if (!latestMessage || (existingLearnedThroughAt && existingLearnedThroughAt >= latestMessage.createdAt)) {
        return { status: "already_learned" as const };
      }
    }

    const [job] = await this.database.db
      .insert(learningJobs)
      .values({
        jobType: "conversation_summary",
        status: "running",
        triggerMode: "manual",
        targetConversationId: conversationId,
      })
      .returning();

    this.conversations.notifyChanged(conversationId);

    try {
      const conversation = await this.conversations.getConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      const existingArtifacts = buildExistingLearningArtifacts(
        await this.memory.listRelevantMemories({
          conversationId,
          userId: conversation.externalUserId,
        }),
        conversation.externalUserId,
      );

      const messageRows = await this.database.db
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
          existingLearnedThroughAt
            ? and(
                eq(messages.conversationId, conversationId),
                gt(messages.createdAt, existingLearnedThroughAt),
              )
            : eq(messages.conversationId, conversationId),
        )
        .orderBy(asc(messages.createdAt));

      const ordered = messageRows.map((message) => ({
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
        attachmentDataUrl: message.attachmentDataUrl,
        attachmentKind: message.attachmentKind,
        attachmentMimeType: message.attachmentMimeType,
        attachmentFileName: message.attachmentFileName,
        replyToMessageId: message.replyToMessageId,
        isDeleted: Boolean(message.isDeleted),
        editedAt: message.editedAt,
        createdAt: message.createdAt,
      }));

      let artifacts: ExistingLearningArtifacts | undefined = existingArtifacts;
      let finalArtifacts: LearningArtifacts | undefined;
      for (const messageBatch of chunkMessages(ordered, LEARNING_BATCH_SIZE)) {
        const nextArtifacts = await this.langChainAi.generateLearningArtifacts({
          conversationTitle: conversation.title,
          participantLabel: conversation.participantLabel ?? conversation.externalUserId,
          recentMessages: messageBatch,
          existingArtifacts: artifacts,
        });
        artifacts = nextArtifacts;
        finalArtifacts = nextArtifacts;
      }

      if (!finalArtifacts) {
        throw new Error("No messages available for learning.");
      }

      const nextLearnedThroughAt = ordered.at(-1)?.createdAt;
      if (nextLearnedThroughAt) {
        await this.conversations.setLearnedThroughAt(conversationId, nextLearnedThroughAt);
      }
      await this.memory.upsertUserProfile(conversation.externalUserId, finalArtifacts.userProfile);
      await this.memory.upsertUserKeyFacts(conversation.externalUserId, finalArtifacts.keyFacts);
      await this.memory.upsertUserStrategy(conversation.externalUserId, finalArtifacts.strategyNotes);

      await this.database.db
        .update(learningJobs)
        .set({ status: "completed", updatedAt: new Date().toISOString() })
        .where(eq(learningJobs.id, job.id));
      this.conversations.notifyChanged(conversationId);
      return { status: "started" as const };
    } catch (error) {
      await this.database.db
        .update(learningJobs)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "Unknown learning error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(learningJobs.id, job.id));
      this.conversations.notifyChanged(conversationId);
      throw error;
    }
  }
}

function chunkMessages<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildExistingLearningArtifacts(
  memories: MemoryEntry[],
  userId: string,
): ExistingLearningArtifacts | undefined {
  const userProfile = memories.find(
    (memory) =>
      memory.memoryScope === "user" &&
      memory.memoryType === "profile" &&
      memory.scopeRefId === userId,
  )?.content;
  const keyFactsContent = memories.find(
    (memory) =>
      memory.memoryScope === "user" &&
      memory.memoryType === "fact" &&
      memory.scopeRefId === userId,
  )?.content;
  const strategyNotes = memories.find(
    (memory) =>
      memory.memoryScope === "user" &&
      memory.memoryType === "strategy" &&
      memory.scopeRefId === userId,
  )?.content;
  const keyFacts =
    keyFactsContent
      ?.split("\n")
      .map((fact) => fact.trim())
      .filter(Boolean) ?? [];

  if (!userProfile && keyFacts.length === 0 && !strategyNotes) {
    return undefined;
  }

  return {
    userProfile,
    keyFacts,
    strategyNotes,
  };
}
