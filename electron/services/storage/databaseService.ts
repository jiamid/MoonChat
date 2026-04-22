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
  }

  close() {
    this.sqlite.close();
  }
}
