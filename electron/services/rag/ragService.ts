import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { DatabaseService } from "../storage/databaseService.js";
import { knowledgeChunks, knowledgeDocuments } from "../../../src/shared/db/schema.js";
import type {
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  RagProgressEvent,
} from "../../../src/shared/contracts.js";
import { EmbeddingService } from "./embeddingService.js";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 140;

export class RagService {
  private readonly embeddings: EmbeddingService;
  private readonly progressListeners = new Set<(event: RagProgressEvent) => void>();
  private lastProgress: RagProgressEvent;

  constructor(
    private readonly database: DatabaseService,
    dataDir: string,
  ) {
    this.lastProgress = buildProgressEvent({
      phase: "idle",
      message: "内置 embedding 已准备好，首次索引会自动下载模型到本地缓存。",
      model: "Xenova/multilingual-e5-small",
      percent: null,
    });
    this.embeddings = new EmbeddingService(path.join(dataDir, "models", "transformers"), (event) =>
      this.emitProgress(event),
    );
  }

  getEmbeddingStatus() {
    return this.embeddings.getStatus();
  }

  getProgress() {
    return this.lastProgress;
  }

  onProgress(listener: (event: RagProgressEvent) => void) {
    this.progressListeners.add(listener);
    listener(this.lastProgress);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  async listDocuments(): Promise<KnowledgeDocumentSummary[]> {
    const rows = await this.database.db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        sourceType: knowledgeDocuments.sourceType,
        sourcePath: knowledgeDocuments.sourcePath,
        chunkCount: knowledgeDocuments.chunkCount,
        embeddingModel: knowledgeDocuments.embeddingModel,
        status: knowledgeDocuments.status,
        lastError: knowledgeDocuments.lastError,
        createdAt: knowledgeDocuments.createdAt,
        updatedAt: knowledgeDocuments.updatedAt,
      })
      .from(knowledgeDocuments)
      .orderBy(desc(knowledgeDocuments.updatedAt));

    return rows.map((row) => ({
      ...row,
      status: normalizeDocumentStatus(row.status),
    }));
  }

  async importFiles(filePaths: string[]) {
    const imported: KnowledgeDocumentSummary[] = [];
    for (const filePath of filePaths) {
      imported.push(await this.importFile(filePath));
    }
    return imported;
  }

  async deleteDocument(documentId: string) {
    await this.database.db
      .delete(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, documentId));
  }

  async rebuildDocument(documentId: string) {
    const document = await this.database.db.query.knowledgeDocuments.findFirst({
      where: eq(knowledgeDocuments.id, documentId),
    });
    if (!document?.sourcePath) {
      throw new Error("这个知识文档没有可重建的本地文件路径。");
    }
    return this.importFile(document.sourcePath, documentId);
  }

  async search(query: string, limit = 8): Promise<KnowledgeSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const chunks = await this.database.db
      .select({
        chunkId: knowledgeChunks.id,
        documentId: knowledgeChunks.documentId,
        documentTitle: knowledgeDocuments.title,
        sourcePath: knowledgeDocuments.sourcePath,
        chunkIndex: knowledgeChunks.chunkIndex,
        content: knowledgeChunks.content,
        embeddingJson: knowledgeChunks.embeddingJson,
        embeddingModel: knowledgeChunks.embeddingModel,
      })
      .from(knowledgeChunks)
      .innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(eq(knowledgeDocuments.status, "indexed"));

    if (!chunks.length) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddings.embed(normalizedQuery, "query");
      const vectorResults = chunks
        .filter((chunk) => chunk.embeddingModel === this.embeddings.getModelName())
        .map((chunk) => ({
          chunk,
          score: cosineSimilarity(queryEmbedding, parseEmbedding(chunk.embeddingJson)),
        }))
        .filter((item) => Number.isFinite(item.score) && item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ chunk, score }) => toSearchResult(chunk, score, "vector" as const));

      if (vectorResults.length) {
        return mergeResults(vectorResults, keywordSearch(chunks, normalizedQuery, limit), limit);
      }
    } catch {
      // Keyword fallback keeps the app useful while the built-in model is still downloading.
    }

    return keywordSearch(chunks, normalizedQuery, limit);
  }

  async buildContext(query: string, limit = 6) {
    const results = await this.search(query, limit);
    if (!results.length) {
      return "";
    }

    return results
      .map(
        (result, index) =>
          `[知识库 ${index + 1}] ${result.documentTitle} / 片段 ${result.chunkIndex + 1} / ${result.matchType} / score ${result.score.toFixed(3)}\n${result.content}`,
      )
      .join("\n\n");
  }

  private async importFile(filePath: string, existingDocumentId?: string): Promise<KnowledgeDocumentSummary> {
    const raw = await fs.readFile(filePath, "utf8");
    const content = normalizeText(raw);
    if (!content) {
      throw new Error(`${path.basename(filePath)} 没有可导入的文本内容。`);
    }

    const now = new Date().toISOString();
    const contentHash = hashText(content);
    const title = path.basename(filePath);
    const chunks = splitIntoChunks(content);
    const embeddingModel = this.embeddings.getModelName();

    const existing = existingDocumentId
      ? await this.database.db.query.knowledgeDocuments.findFirst({
          where: eq(knowledgeDocuments.id, existingDocumentId),
        })
      : await this.database.db.query.knowledgeDocuments.findFirst({
          where: and(
            eq(knowledgeDocuments.sourcePath, filePath),
            eq(knowledgeDocuments.contentHash, contentHash),
          ),
        });

    if (existing && existing.status === "indexed" && existing.contentHash === contentHash) {
      return toDocumentSummary(existing);
    }

    let documentId = existing?.id;
    if (documentId) {
      await this.database.db
        .update(knowledgeDocuments)
        .set({
          title,
          sourcePath: filePath,
          contentHash,
          chunkCount: chunks.length,
          embeddingModel,
          status: "pending",
          lastError: null,
          updatedAt: now,
        })
        .where(eq(knowledgeDocuments.id, documentId));
      await this.database.db
        .delete(knowledgeChunks)
        .where(eq(knowledgeChunks.documentId, documentId));
    } else {
      const [document] = await this.database.db
        .insert(knowledgeDocuments)
        .values({
          title,
          sourceType: "manual_file",
          sourcePath: filePath,
          contentHash,
          chunkCount: chunks.length,
          embeddingModel,
          status: "pending",
        })
        .returning();
      documentId = document.id;
    }

    this.emitProgress({
      phase: "document_indexing",
      message: `正在索引 ${title}`,
      model: embeddingModel,
      percent: 0,
      documentId,
      documentTitle: title,
      totalChunks: chunks.length,
      chunkIndex: null,
      error: null,
    });

    let indexedCount = 0;
    let lastError: string | null = null;
    for (const [chunkIndex, chunkContent] of chunks.entries()) {
      try {
        this.emitProgress({
          phase: "chunk_indexing",
          message: `正在生成向量: ${title} (${chunkIndex + 1}/${chunks.length})`,
          model: embeddingModel,
          percent: Math.round((chunkIndex / Math.max(1, chunks.length)) * 100),
          documentId,
          documentTitle: title,
          chunkIndex: chunkIndex + 1,
          totalChunks: chunks.length,
          error: null,
        });
        const embedding = await this.embeddings.embed(chunkContent, "passage");
        await this.database.db.insert(knowledgeChunks).values({
          documentId,
          chunkIndex,
          content: chunkContent,
          contentHash: hashText(chunkContent),
          tokenEstimate: estimateTokens(chunkContent),
          embeddingJson: JSON.stringify(embedding),
          embeddingModel,
          indexedAt: new Date().toISOString(),
        });
        indexedCount += 1;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "生成 embedding 失败。";
        this.emitProgress({
          phase: "error",
          message: `片段 ${chunkIndex + 1}/${chunks.length} 索引失败。`,
          model: embeddingModel,
          documentId,
          documentTitle: title,
          chunkIndex: chunkIndex + 1,
          totalChunks: chunks.length,
          error: lastError,
        });
        await this.database.db.insert(knowledgeChunks).values({
          documentId,
          chunkIndex,
          content: chunkContent,
          contentHash: hashText(chunkContent),
          tokenEstimate: estimateTokens(chunkContent),
          embeddingModel,
        });
      }
    }

    const status = indexedCount === chunks.length ? "indexed" : indexedCount > 0 ? "partial" : "failed";
    await this.database.db
      .update(knowledgeDocuments)
      .set({
        status,
        lastError,
        chunkCount: chunks.length,
        embeddingModel,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(knowledgeDocuments.id, documentId));

    const saved = await this.database.db.query.knowledgeDocuments.findFirst({
      where: eq(knowledgeDocuments.id, documentId),
    });
    if (!saved) {
      throw new Error("知识文档保存失败。");
    }
    this.emitProgress({
      phase: status === "failed" ? "error" : "completed",
      message:
        status === "indexed"
          ? `已完成索引 ${title}`
          : status === "partial"
            ? `${title} 部分索引完成，部分片段失败。`
            : `${title} 索引失败。`,
      model: embeddingModel,
      percent: status === "failed" ? null : 100,
      documentId,
      documentTitle: title,
      chunkIndex: chunks.length,
      totalChunks: chunks.length,
      error: lastError,
    });
    return toDocumentSummary(saved);
  }

  private emitProgress(event: Partial<RagProgressEvent>) {
    const shouldClearModelFileProgress =
      event.phase !== undefined &&
      event.phase !== "model_loading" &&
      event.phase !== "model_downloading";
    this.lastProgress = buildProgressEvent({
      ...this.lastProgress,
      ...(shouldClearModelFileProgress
        ? {
            file: null,
            loaded: null,
            total: null,
          }
        : {}),
      ...event,
    });
    for (const listener of this.progressListeners) {
      listener(this.lastProgress);
    }
  }
}

function buildProgressEvent(event: Partial<RagProgressEvent>): RagProgressEvent {
  return {
    phase: event.phase ?? "idle",
    message: event.message ?? "",
    model: event.model ?? "Xenova/multilingual-e5-small",
    percent: event.percent ?? null,
    file: event.file ?? null,
    loaded: event.loaded ?? null,
    total: event.total ?? null,
    documentId: event.documentId ?? null,
    documentTitle: event.documentTitle ?? null,
    chunkIndex: event.chunkIndex ?? null,
    totalChunks: event.totalChunks ?? null,
    error: event.error ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function splitIntoChunks(content: string) {
  const paragraphs = content.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= CHUNK_SIZE) {
      current = (current ? `${current}\n\n` : "") + paragraph;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= CHUNK_SIZE) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(paragraph.slice(start, start + CHUNK_SIZE).trim());
    }
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(Boolean);
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 2);
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

function parseEmbedding(embeddingJson: string | null) {
  if (!embeddingJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(embeddingJson);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "number") : [];
  } catch {
    return [];
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function keywordSearch(
  chunks: Array<{
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sourcePath: string | null;
    chunkIndex: number;
    content: string;
  }>,
  query: string,
  limit: number,
) {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[\s,，。！？；;:：、]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );

  if (!terms.length) {
    terms.push(query.toLowerCase());
  }

  return chunks
    .map((chunk) => {
      const lowerContent = chunk.content.toLowerCase();
      const hits = terms.reduce((total, term) => total + countOccurrences(lowerContent, term), 0);
      return { chunk, score: hits / Math.max(1, terms.length) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => toSearchResult(chunk, score, "keyword" as const));
}

function countOccurrences(text: string, term: string) {
  let count = 0;
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(term, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + term.length;
  }
  return count;
}

function mergeResults(
  vectorResults: KnowledgeSearchResult[],
  keywordResults: KnowledgeSearchResult[],
  limit: number,
) {
  const results = new Map<string, KnowledgeSearchResult>();
  for (const result of [...vectorResults, ...keywordResults]) {
    const existing = results.get(result.chunkId);
    if (!existing || result.score > existing.score) {
      results.set(result.chunkId, result);
    }
  }
  return Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function toSearchResult(
  chunk: {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    sourcePath: string | null;
    chunkIndex: number;
    content: string;
  },
  score: number,
  matchType: "vector" | "keyword",
): KnowledgeSearchResult {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    sourcePath: chunk.sourcePath,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    score,
    matchType,
  };
}

function normalizeDocumentStatus(status: string): KnowledgeDocumentSummary["status"] {
  if (status === "indexed" || status === "partial" || status === "failed") {
    return status;
  }
  return "pending";
}

function toDocumentSummary(row: typeof knowledgeDocuments.$inferSelect): KnowledgeDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.sourceType,
    sourcePath: row.sourcePath,
    chunkCount: row.chunkCount,
    embeddingModel: row.embeddingModel,
    status: normalizeDocumentStatus(row.status),
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
