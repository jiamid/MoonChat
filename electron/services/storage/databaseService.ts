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
    this.ensureColumn("messages", "attachment_mime_type", "TEXT");
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

  close() {
    this.sqlite.close();
  }
}
