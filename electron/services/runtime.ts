import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseService } from "./storage/databaseService.js";
import { ConversationService } from "./storage/conversationService.js";
import { DashboardService } from "./storage/dashboardService.js";
import { LearningService } from "./learning/learningService.js";
import { MemoryService } from "./memory/memoryService.js";
import { AiOrchestratorService } from "./orchestration/aiOrchestratorService.js";
import { TelegramBotService } from "./telegram/telegramBotService.js";
import { LangChainAiService } from "./ai/langChainAiService.js";
import { AppSettingsService } from "./settings/appSettingsService.js";
import type { AppSettings } from "../../src/shared/contracts.js";

export class AppRuntime {
  private constructor(
    public readonly db: DatabaseService,
    public readonly settings: AppSettingsService,
    public readonly conversations: ConversationService,
    public readonly dashboard: DashboardService,
    public readonly learning: LearningService,
    public readonly memory: MemoryService,
    public readonly ai: AiOrchestratorService,
    public readonly telegram: TelegramBotService,
  ) {}

  static async bootstrap(userDataPath: string) {
    const dataDir = path.join(process.cwd(), "data");
    await fs.mkdir(dataDir, { recursive: true });

    const db = new DatabaseService(path.join(dataDir, "moonchat.db"));
    const settings = await AppSettingsService.bootstrap(dataDir);
    const memory = new MemoryService(db);
    const conversations = new ConversationService(db);
    const langChainAi = new LangChainAiService(settings.getSettings().ai);
    const ai = new AiOrchestratorService(db, memory, conversations, langChainAi);
    const learning = new LearningService(db, memory, conversations, langChainAi);
    const dashboard = new DashboardService(db);
    const telegram = new TelegramBotService(conversations, ai);

    await db.migrate();
    await telegram.start(settings.getSettings().telegram.botToken);

    return new AppRuntime(db, settings, conversations, dashboard, learning, memory, ai, telegram);
  }

  getSettings() {
    return this.settings.getSettings();
  }

  async updateSettings(nextSettings: AppSettings) {
    const saved = await this.settings.updateSettings(nextSettings);
    this.ai.reconfigure(saved.ai);
    this.learning.reconfigure(saved.ai);
    await this.telegram.reconfigure(saved.telegram.botToken);
    return saved;
  }

  async shutdown() {
    await this.telegram.stop();
    this.db.close();
  }
}
