import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamp = (name: string) =>
  text(name)
    .notNull()
    .$defaultFn(() => new Date().toISOString());

export const conversations = sqliteTable("conversations", {
  id: id(),
  title: text("title").notNull(),
  channelType: text("channel_type").notNull(),
  channelId: text("channel_id"),
  externalChatId: text("external_chat_id"),
  externalUserId: text("external_user_id").notNull(),
  participantLabel: text("participant_label"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const messages = sqliteTable("messages", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  externalMessageId: text("external_message_id"),
  senderType: text("sender_type").notNull(),
  senderId: text("sender_id").notNull(),
  sourceType: text("source_type").notNull(),
  messageRole: text("message_role").notNull(),
  contentText: text("content_text").notNull(),
  contentType: text("content_type").notNull().default("text"),
  attachmentImageDataUrl: text("attachment_image_data_url"),
  attachmentDataUrl: text("attachment_data_url"),
  attachmentKind: text("attachment_kind"),
  attachmentMimeType: text("attachment_mime_type"),
  attachmentFileName: text("attachment_file_name"),
  replyToMessageId: text("reply_to_message_id"),
  isDeleted: integer("is_deleted").notNull().default(0),
  editedAt: text("edited_at"),
  createdAt: timestamp("created_at"),
});

export const messageEdits = sqliteTable("message_edits", {
  id: id(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  previousText: text("previous_text").notNull(),
  editedBy: text("edited_by").notNull(),
  createdAt: timestamp("created_at"),
});

export const messageDeletions = sqliteTable("message_deletions", {
  id: id(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  deletedBy: text("deleted_by").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at"),
});

export const conversationAiSettings = sqliteTable("conversation_ai_settings", {
  id: id(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  autoReplyEnabled: integer("auto_reply_enabled").notNull().default(0),
  replyMode: text("reply_mode").notNull().default("manual"),
  fallbackToHuman: integer("fallback_to_human").notNull().default(1),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
  triggerRules: text("trigger_rules"),
  updatedAt: timestamp("updated_at"),
});

export const memories = sqliteTable("memories", {
  id: id(),
  memoryScope: text("memory_scope").notNull(),
  memoryType: text("memory_type").notNull(),
  scopeRefId: text("scope_ref_id"),
  content: text("content").notNull(),
  summary: text("summary"),
  importanceScore: real("importance_score").notNull().default(0.5),
  confidence: real("confidence").notNull().default(0.5),
  source: text("source").notNull(),
  evidenceMessageIds: text("evidence_message_ids"),
  isInferred: integer("is_inferred").notNull().default(0),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const learningJobs = sqliteTable("learning_jobs", {
  id: id(),
  jobType: text("job_type").notNull(),
  triggerMode: text("trigger_mode").notNull(),
  status: text("status").notNull(),
  targetConversationId: text("target_conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  targetUserId: text("target_user_id"),
  runAt: text("run_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const aiReplyLogs = sqliteTable("ai_reply_logs", {
  id: id(),
  conversationId: text("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  inboundMessageId: text("inbound_message_id"),
  outboundMessageId: text("outbound_message_id"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  promptSnapshot: text("prompt_snapshot"),
  responseSnapshot: text("response_snapshot"),
  status: text("status").notNull(),
  createdAt: timestamp("created_at"),
});

export const knowledgeDocuments = sqliteTable("knowledge_documents", {
  id: id(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull().default("manual_file"),
  sourcePath: text("source_path"),
  contentHash: text("content_hash").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  embeddingModel: text("embedding_model"),
  status: text("status").notNull().default("pending"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: id(),
  documentId: text("document_id")
    .notNull()
    .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  tokenEstimate: integer("token_estimate").notNull().default(0),
  embeddingJson: text("embedding_json"),
  embeddingModel: text("embedding_model"),
  indexedAt: text("indexed_at"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const conversationRelations = relations(conversations, ({ many, one }) => ({
  messages: many(messages),
  aiSettings: one(conversationAiSettings, {
    fields: [conversations.id],
    references: [conversationAiSettings.conversationId],
  }),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const bootstrapSql = `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    channel_id TEXT,
    external_chat_id TEXT,
    external_user_id TEXT NOT NULL,
    participant_label TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    external_message_id TEXT,
    sender_type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    message_role TEXT NOT NULL,
    content_text TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    attachment_image_data_url TEXT,
    attachment_data_url TEXT,
    attachment_kind TEXT,
    attachment_mime_type TEXT,
    attachment_file_name TEXT,
    reply_to_message_id TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    edited_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_edits (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    previous_text TEXT NOT NULL,
    edited_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_deletions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    deleted_by TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversation_ai_settings (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    auto_reply_enabled INTEGER NOT NULL DEFAULT 0,
    reply_mode TEXT NOT NULL DEFAULT 'manual',
    fallback_to_human INTEGER NOT NULL DEFAULT 1,
    cooldown_seconds INTEGER NOT NULL DEFAULT 0,
    trigger_rules TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    memory_scope TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    scope_ref_id TEXT,
    content TEXT NOT NULL,
    summary TEXT,
    importance_score REAL NOT NULL DEFAULT 0.5,
    confidence REAL NOT NULL DEFAULT 0.5,
    source TEXT NOT NULL,
    evidence_message_ids TEXT,
    is_inferred INTEGER NOT NULL DEFAULT 0,
    valid_from TEXT,
    valid_to TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS learning_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    trigger_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    target_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    target_user_id TEXT,
    run_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_reply_logs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    inbound_message_id TEXT,
    outbound_message_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_snapshot TEXT,
    response_snapshot TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual_file',
    source_path TEXT,
    content_hash TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    embedding_model TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    embedding_json TEXT,
    embedding_model TEXT,
    indexed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
    ON messages (conversation_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_memories_scope_type_ref
    ON memories (memory_scope, memory_type, scope_ref_id);

  CREATE INDEX IF NOT EXISTS idx_learning_jobs_status_updated_at
    ON learning_jobs (status, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_knowledge_documents_updated_at
    ON knowledge_documents (updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_index
    ON knowledge_chunks (document_id, chunk_index);
`;
