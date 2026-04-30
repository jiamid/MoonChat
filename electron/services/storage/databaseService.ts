import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../src/shared/db/schema.js";

export class DatabaseService {
  private readonly sqlite: Database.Database;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(databasePath: string) {
    this.sqlite = new Database(databasePath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.db = drizzle(this.sqlite, { schema });
  }

  async migrate() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS app_bootstrap (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.sqlite.exec(schema.bootstrapSql);
    this.ensureColumn("conversations", "channel_id", "TEXT");
    this.ensureColumn("messages", "attachment_image_data_url", "TEXT");
    this.ensureColumn("messages", "attachment_data_url", "TEXT");
    this.ensureColumn("messages", "attachment_kind", "TEXT");
    this.ensureColumn("messages", "attachment_mime_type", "TEXT");
    this.ensureColumn("messages", "attachment_file_name", "TEXT");
    this.ensureColumn("conversation_ai_settings", "learned_through_at", "TEXT");
    this.ensureColumn("knowledge_documents", "embedding_model", "TEXT");
    this.ensureColumn("knowledge_documents", "last_error", "TEXT");
    this.ensureColumn("knowledge_chunks", "embedding_model", "TEXT");
    this.migrateConversationSummaryMemories();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string) {
    const columns = this.sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private migrateConversationSummaryMemories() {
    this.sqlite.exec(`
      INSERT INTO conversation_ai_settings (
        id,
        conversation_id,
        auto_reply_enabled,
        reply_mode,
        fallback_to_human,
        cooldown_seconds,
        learned_through_at,
        updated_at
      )
      SELECT
        lower(hex(randomblob(4))) || '-' ||
          lower(hex(randomblob(2))) || '-4' ||
          substr(lower(hex(randomblob(2))), 2) || '-' ||
          substr('89ab', abs(random()) % 4 + 1, 1) ||
          substr(lower(hex(randomblob(2))), 2) || '-' ||
          lower(hex(randomblob(6))),
        scope_ref_id,
        0,
        'manual',
        1,
        0,
        updated_at,
        updated_at
      FROM memories
      WHERE memory_scope = 'conversation'
        AND memory_type = 'summary'
        AND scope_ref_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM conversation_ai_settings
          WHERE conversation_ai_settings.conversation_id = memories.scope_ref_id
        );

      UPDATE conversation_ai_settings
      SET learned_through_at = (
        SELECT updated_at
        FROM memories
        WHERE memories.memory_scope = 'conversation'
          AND memories.memory_type = 'summary'
          AND memories.scope_ref_id = conversation_ai_settings.conversation_id
      )
      WHERE learned_through_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM memories
          WHERE memories.memory_scope = 'conversation'
            AND memories.memory_type = 'summary'
            AND memories.scope_ref_id = conversation_ai_settings.conversation_id
        );

      DELETE FROM memories
      WHERE memory_scope = 'conversation'
        AND memory_type = 'summary';
    `);
  }

  close() {
    this.sqlite.close();
  }
}
