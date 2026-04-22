import { count, desc, eq } from "drizzle-orm";
import type { AppDashboardSnapshot } from "../../../src/shared/contracts.js";
import { conversations, learningJobs, memories, messages } from "../../../src/shared/db/schema.js";
import type { DatabaseService } from "./databaseService.js";

export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async getSnapshot(): Promise<AppDashboardSnapshot> {
    const [conversationCount] = await this.database.db.select({ value: count() }).from(conversations);
    const [messageCount] = await this.database.db.select({ value: count() }).from(messages);
    const [memoryCount] = await this.database.db.select({ value: count() }).from(memories);

    const latestJobs = await this.database.db
      .select({
        id: learningJobs.id,
        jobType: learningJobs.jobType,
        status: learningJobs.status,
        targetConversationId: learningJobs.targetConversationId,
        updatedAt: learningJobs.updatedAt,
      })
      .from(learningJobs)
      .orderBy(desc(learningJobs.updatedAt))
      .limit(5);

    return {
      counters: {
        conversations: conversationCount?.value ?? 0,
        messages: messageCount?.value ?? 0,
        memories: memoryCount?.value ?? 0,
      },
      latestJobs,
    };
  }
}
