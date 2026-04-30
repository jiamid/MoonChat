import { and, desc, eq, or } from "drizzle-orm";
import type { DatabaseService } from "../storage/databaseService.js";
import { memories } from "../../../src/shared/db/schema.js";
import type { MemoryEntry } from "../../../src/shared/contracts.js";

export class MemoryService {
  constructor(private readonly database: DatabaseService) {}
  private static readonly GLOBAL_AI_SCOPE_ID = "global-ai";

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
    updatedAt?: string;
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
          updatedAt: input.updatedAt ?? new Date().toISOString(),
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
      updatedAt: input.updatedAt,
    });
  }

  async buildAiContext(input: { conversationId: string; userId?: string }) {
    const memoryRows = await this.database.db.query.memories.findMany();

    return memoryRows
      .filter((memory) => {
        return (
          memory.memoryScope === "global_ai" ||
          memory.scopeRefId === input.conversationId ||
          (input.userId ? memory.scopeRefId === input.userId : false)
        );
      })
      .sort((a, b) => {
        const scopeRank = (scope: string) => {
          if (scope === "global_ai") return 0;
          if (scope === "user") return 1;
          if (scope === "conversation") return 2;
          return 3;
        };
        const rankDelta = scopeRank(a.memoryScope) - scopeRank(b.memoryScope);
        if (rankDelta !== 0) {
          return rankDelta;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, 20)
      .map(
        (memory) =>
          `[${labelMemoryScope(memory.memoryScope)} / ${memory.memoryType}] ${memory.summary ?? ""}\n${memory.content}`,
      )
      .join("\n\n");
  }

  async listRelevantMemories(input: {
    conversationId?: string;
    userId?: string;
  }): Promise<MemoryEntry[]> {
    const scopeConditions = [
      input.conversationId ? eq(memories.scopeRefId, input.conversationId) : null,
      input.userId ? eq(memories.scopeRefId, input.userId) : null,
    ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

    if (!scopeConditions.length) {
      return [];
    }

    const memoryRows = await this.database.db
      .select()
      .from(memories)
      .where(scopeConditions.length === 1 ? scopeConditions[0] : or(...scopeConditions))
      .orderBy(desc(memories.updatedAt));

    return memoryRows.map((memory) => ({
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

  async getGlobalAiMemories(): Promise<MemoryEntry[]> {
    const memoryRows = await this.database.db.query.memories.findMany();

    return memoryRows
      .filter(
        (memory) =>
          memory.memoryScope === "global_ai" &&
          memory.scopeRefId === MemoryService.GLOBAL_AI_SCOPE_ID,
      )
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

  async upsertGlobalAiMemory(input: {
    memoryType: "base" | "style" | "knowledge";
    content: string;
    summary: string;
  }) {
    await this.upsertMemory({
      memoryScope: "global_ai",
      memoryType: input.memoryType,
      scopeRefId: MemoryService.GLOBAL_AI_SCOPE_ID,
      content: input.content,
      summary: input.summary,
      source: "manual_ai_config",
      importanceScore: 0.9,
      confidence: 1,
      isInferred: false,
    });
  }

}

function labelMemoryScope(memoryScope: string) {
  if (memoryScope === "global_ai") return "全局通用记忆";
  if (memoryScope === "user") return "当前聊天对象记忆";
  if (memoryScope === "conversation") return "当前会话记忆";
  return memoryScope;
}
