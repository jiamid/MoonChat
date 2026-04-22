import TelegramBot from "node-telegram-bot-api";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private botToken = "";

  constructor(
    private readonly conversations: ConversationService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async start(token?: string) {
    const nextToken = token ?? this.botToken;
    if (!nextToken) {
      return;
    }

    this.botToken = nextToken;
    this.bot = new TelegramBot(nextToken, { polling: true });
    this.bot.on("message", async (message) => {
      if (!message.text || !message.from) {
        return;
      }

      const conversation = await this.conversations.findOrCreateTelegramConversation({
        chatId: String(message.chat.id),
        title: message.chat.title ?? message.from.first_name ?? "Telegram User",
        externalUserId: String(message.from.id),
        username: message.from.username,
      });

      await this.conversations.appendInboundTelegramMessage({
        conversationId: conversation.id,
        externalMessageId: String(message.message_id),
        senderId: String(message.from.id),
        text: message.text,
      });

      const reply = await this.ai.handlePotentialAutoReply({
        conversationId: conversation.id,
        senderId: String(message.from.id),
        inboundText: message.text,
      });

      if (reply && this.bot) {
        await this.bot.sendMessage(message.chat.id, reply);
      }
    });
  }

  async reconfigure(token: string) {
    const normalized = token.trim();
    if (normalized === this.botToken && this.bot) {
      return;
    }

    await this.stop();
    this.botToken = normalized;

    if (normalized) {
      await this.start(normalized);
    }
  }

  async stop() {
    await this.bot?.stopPolling();
    this.bot = null;
  }

  async sendManualMessage(chatId: string, text: string) {
    if (!this.bot) {
      throw new Error("Telegram bot is not started. Please complete the Telegram Bot Token in settings first.");
    }

    return this.bot.sendMessage(chatId, text);
  }
}
