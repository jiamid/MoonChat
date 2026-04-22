import { eq, and } from "drizzle-orm";
import type { DatabaseService } from "../storage/databaseService.js";
import { memories } from "../../../src/shared/db/schema.js";
import type { MemoryEntry } from "../../../src/shared/contracts.js";

export class MemoryService {
  constructor(private readonly database: DatabaseService) {}

  async upsertConversationSummary(conversationId: string, content: string) {
    await this.upsertMemory({
      memoryScope: "conversation",
      memoryType: "summary",
      scopeRefId: conversationId,
      content,
      summary: "Latest conversation summary",
      source: "learning_job",
      importanceScore: 0.6,
      confidence: 0.8,
      isInferred: true,
    });
  }

  async upsertUserProfile(userId: string, content: string) {
    await this.upsertMemory({
      memoryScope: "user",
      memoryType: "profile",
      scopeRefId: userId,
      content,
      summary: "Latest user profile",
      source: "learning_job",
      importanceScore: 0.75,
      confidence: 0.75,
      isInferred: true,
    });
  }

  async upsertUserKeyFacts(userId: string, facts: string[]) {
    await this.upsertMemory({
      memoryScope: "user",
      memoryType: "fact",
      scopeRefId: userId,
      content: facts.join("\n"),
      summary: "Key facts extracted from chat history",
      source: "learning_job",
      importanceScore: 0.85,
      confidence: 0.8,
      isInferred: true,
    });
  }

  async upsertUserStrategy(userId: string, content: string) {
    await this.upsertMemory({
      memoryScope: "user",
      memoryType: "strategy",
      scopeRefId: userId,
      content,
      summary: "Suggested reply strategy for this user",
      source: "learning_job",
      importanceScore: 0.72,
      confidence: 0.7,
      isInferred: true,
    });
  }

  async upsertMemory(input: {
    memoryScope: string;
    memoryType: string;
    scopeRefId: string;
    content: string;
    summary: string;
    source: string;
    importanceScore?: number;
    confidence?: number;
    isInferred?: boolean;
  }) {
    const existing = await this.database.db.query.memories.findFirst({
      where: and(
        eq(memories.memoryScope, input.memoryScope),
        eq(memories.memoryType, input.memoryType),
        eq(memories.scopeRefId, input.scopeRefId),
      ),
    });

    if (existing) {
      await this.database.db
        .update(memories)
        .set({
          content: input.content,
          summary: input.summary,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(memories.id, existing.id));
      return;
    }

    await this.database.db.insert(memories).values({
      memoryScope: input.memoryScope,
      memoryType: input.memoryType,
      scopeRefId: input.scopeRefId,
      content: input.content,
      summary: input.summary,
      importanceScore: input.importanceScore ?? 0.6,
      confidence: input.confidence ?? 0.75,
      source: input.source,
      isInferred: input.isInferred ? 1 : 0,
    });
  }

  async buildAiContext(input: { conversationId: string; userId?: string }) {
    const memoryRows = await this.database.db.query.memories.findMany();

    return memoryRows
      .filter((memory) => {
        return (
          memory.scopeRefId === input.conversationId ||
          (input.userId ? memory.scopeRefId === input.userId : false)
        );
      })
      .slice(0, 20)
      .map((memory) => `[${memory.memoryType}] ${memory.summary ?? ""}\n${memory.content}`)
      .join("\n\n");
  }

  async listRelevantMemories(input: {
    conversationId?: string;
    userId?: string;
  }): Promise<MemoryEntry[]> {
    const memoryRows = await this.database.db.query.memories.findMany();

    return memoryRows
      .filter((memory) => {
        return (
          (input.conversationId ? memory.scopeRefId === input.conversationId : false) ||
          (input.userId ? memory.scopeRefId === input.userId : false)
        );
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((memory) => ({
        id: memory.id,
        memoryScope: memory.memoryScope,
        memoryType: memory.memoryType,
        scopeRefId: memory.scopeRefId,
        content: memory.content,
        summary: memory.summary,
        confidence: memory.confidence,
        updatedAt: memory.updatedAt,
      }));
  }
}
