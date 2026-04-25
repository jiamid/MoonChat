import path from "node:path";
import fs from "node:fs/promises";
import { DatabaseService } from "./storage/databaseService.js";
import { ConversationService } from "./storage/conversationService.js";
import { DashboardService } from "./storage/dashboardService.js";
import { LearningService } from "./learning/learningService.js";
import { MemoryService } from "./memory/memoryService.js";
import { AiOrchestratorService } from "./orchestration/aiOrchestratorService.js";
import { TelegramBotService } from "./telegram/telegramBotService.js";
import { TelegramUserService } from "./telegram/telegramUserService.js";
import { WhatsappPersonalService } from "./whatsapp/whatsappPersonalService.js";
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
    public readonly telegramUser: TelegramUserService,
    public readonly whatsapp: WhatsappPersonalService,
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
    const telegramUser = new TelegramUserService(conversations, ai);
    const whatsapp = new WhatsappPersonalService(dataDir, conversations, ai);
    ai.setAssistantConversationSender(async ({ conversationId, text }) => {
      const conversation = await conversations.getConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found.");
      }

      if (conversation.channelType === "telegram" && conversation.externalChatId) {
        const sent = await telegram.sendManualMessage(
          conversation.channelId,
          conversation.externalChatId,
          text,
        );
        await conversations.createHumanReply({
          conversationId,
          senderId: "moonchat-ai-assistant",
          text,
          sourceType: "telegram",
          externalMessageId: String(sent.message_id),
        });
        return { channelType: conversation.channelType };
      }

      if (conversation.channelType === "telegram_user" && conversation.externalChatId) {
        const sent = await telegramUser.sendManualMessage(
          conversation.channelId,
          conversation.externalChatId,
          text,
        );
        await conversations.createHumanReply({
          conversationId,
          senderId: "moonchat-ai-assistant",
          text,
          sourceType: "telegram_user",
          externalMessageId: String(sent.id),
        });
        return { channelType: conversation.channelType };
      }

      if (conversation.channelType === "whatsapp_personal" && conversation.externalChatId) {
        const sent = await whatsapp.sendManualMessage(
          conversation.channelId,
          conversation.externalChatId,
          text,
        );
        await conversations.createHumanReply({
          conversationId,
          senderId: "moonchat-ai-assistant",
          text,
          sourceType: "whatsapp_personal",
          externalMessageId: sent?.key.id ?? undefined,
        });
        return { channelType: conversation.channelType };
      }

      if (conversation.channelType === "local_ai") {
        throw new Error("AI 助手不能给本地 AI 会话发送外部消息。");
      }

      await conversations.createHumanReply({
        conversationId,
        senderId: "moonchat-ai-assistant",
        text,
      });
      return { channelType: conversation.channelType };
    });

    await db.migrate();
    const telegramUserChannels = await telegramUser.reconfigure(settings.getSettings().channels);
    const bootChannels = await whatsapp.reconfigure(telegramUserChannels);
    await telegram.reconfigure(bootChannels);

    return new AppRuntime(db, settings, conversations, dashboard, learning, memory, ai, telegram, telegramUser, whatsapp);
  }

  getSettings() {
    return this.settings.getSettings();
  }

  async getChannelStatus(channel: AppSettings["channels"][number]) {
    if (channel.type === "telegram") {
      return this.telegram.getConnectionStatus(channel);
    }
    if (channel.type === "telegram_user") {
      return this.telegramUser.getConnectionStatus(channel);
    }
    if (channel.type === "whatsapp_personal") {
      return this.whatsapp.getConnectionStatus(channel.id);
    }
    return {
      ok: true,
      connected: false,
      needsLogin: false,
      message: "未知渠道类型。",
      checkedAt: new Date().toISOString(),
    };
  }

  async updateSettings(nextSettings: AppSettings) {
    const saved = await this.settings.updateSettings(nextSettings);
    this.ai.reconfigure(saved.ai);
    this.learning.reconfigure(saved.ai);
    const telegramUserChannels = await this.telegramUser.reconfigure(saved.channels);
    const nextChannels = await this.whatsapp.reconfigure(telegramUserChannels);
    await this.telegram.reconfigure(nextChannels);
    if (JSON.stringify(nextChannels) !== JSON.stringify(saved.channels)) {
      return this.settings.updateSettings({ ...saved, channels: nextChannels });
    }
    return saved;
  }

  async shutdown() {
    await this.telegram.stop();
    await this.telegramUser.stop();
    await this.whatsapp.stop();
    this.db.close();
  }
}
