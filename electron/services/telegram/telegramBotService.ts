import TelegramBot from "node-telegram-bot-api";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private botToken = "";
  private readonly processMessage = async (message: TelegramBot.Message, isEdited = false) => {
    try {
      const inboundText = message.text ?? message.caption;
      if (!inboundText || !message.from) {
        return;
      }

      const conversation = await this.conversations.findOrCreateTelegramConversation({
        chatId: String(message.chat.id),
        title: message.chat.title ?? message.from.first_name ?? "Telegram User",
        externalUserId: String(message.from.id),
        username: message.from.username,
      });

      if (isEdited) {
        await this.conversations.upsertInboundTelegramMessageEdit({
          conversationId: conversation.id,
          externalMessageId: String(message.message_id),
          senderId: String(message.from.id),
          text: inboundText,
        });
      } else {
        await this.conversations.appendInboundTelegramMessage({
          conversationId: conversation.id,
          externalMessageId: String(message.message_id),
          senderId: String(message.from.id),
          text: inboundText,
        });
      }

      if (!isEdited) {
        const reply = await this.ai.handlePotentialAutoReply({
          conversationId: conversation.id,
          senderId: String(message.from.id),
          inboundText,
        });

        if (reply && this.bot) {
          await this.bot.sendMessage(message.chat.id, reply);
        }
      }
    } catch (error) {
      console.error("Failed to process Telegram message", {
        error,
        messageId: message.message_id,
        chatId: message.chat.id,
      });
    }
  };
  private readonly onMessage = async (message: TelegramBot.Message) => {
    await this.processMessage(message, false);
  };
  private readonly onEditedMessage = async (message: TelegramBot.Message) => {
    await this.processMessage(message, true);
  };

  constructor(
    private readonly conversations: ConversationService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async start(token?: string) {
    const nextToken = (token ?? this.botToken).trim();
    if (!nextToken) {
      return;
    }

    if (this.bot) {
      await this.stop();
    }

    this.botToken = nextToken;
    const bot = new TelegramBot(nextToken, {
      polling: {
        autoStart: false,
        params: {
          timeout: 10,
        },
      },
    });

    bot.on("message", this.onMessage);
    bot.on("edited_message", this.onEditedMessage);
    bot.on("polling_error", (error) => {
      console.error("Telegram polling error", error);
    });
    bot.on("webhook_error", (error) => {
      console.error("Telegram webhook error", error);
    });

    // A stale webhook on the same bot token can block long polling from receiving updates.
    await bot.deleteWebHook();
    await bot.startPolling();
    this.bot = bot;
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
    if (!this.bot) {
      return;
    }

    this.bot.removeListener("message", this.onMessage);
    this.bot.removeListener("edited_message", this.onEditedMessage);
    await this.bot.stopPolling();
    this.bot = null;
  }

  async sendManualMessage(chatId: string, text: string) {
    if (!this.bot) {
      throw new Error("Telegram bot is not started. Please complete the Telegram Bot Token in settings first.");
    }

    return this.bot.sendMessage(chatId, text);
  }

  async editMessage(chatId: string, messageId: string, text: string) {
    if (!this.bot) {
      throw new Error("Telegram bot is not started. Please complete the Telegram Bot Token in settings first.");
    }

    return this.bot.editMessageText(text, {
      chat_id: chatId,
      message_id: Number(messageId),
    });
  }
}
