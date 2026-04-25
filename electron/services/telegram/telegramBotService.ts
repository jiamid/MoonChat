import TelegramBot from "node-telegram-bot-api";
import type { ChannelConfig } from "../../../src/shared/contracts.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

type TelegramBotInstance = {
  channel: ChannelConfig;
  bot: TelegramBot;
  onMessage: (message: TelegramBot.Message) => Promise<void>;
  onEditedMessage: (message: TelegramBot.Message) => Promise<void>;
};

type ChannelConnectionStatus = {
  ok: true;
  connected: boolean;
  needsLogin: boolean;
  message: string;
  checkedAt: string;
};

export class TelegramBotService {
  private readonly bots = new Map<string, TelegramBotInstance>();
  private readonly statuses = new Map<string, ChannelConnectionStatus>();

  constructor(
    private readonly conversations: ConversationService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async reconfigure(channels: ChannelConfig[]) {
    const telegramChannels = channels.filter(
      (channel) => channel.type === "telegram" && channel.enabled && channel.botToken?.trim(),
    );
    const activeIds = new Set(telegramChannels.map((channel) => channel.id));

    await Promise.all(
      Array.from(this.bots.values())
        .filter((instance) => !activeIds.has(instance.channel.id))
        .map((instance) => this.stopInstance(instance.channel.id)),
    );

    for (const channel of telegramChannels) {
      const existing = this.bots.get(channel.id);
      if (existing && JSON.stringify(existing.channel) === JSON.stringify(channel)) {
        existing.channel = channel;
        continue;
      }

      await this.stopInstance(channel.id);
      try {
        await this.startInstance(channel);
      } catch (error) {
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: false,
          message: formatTelegramBotError(error),
        });
        console.error("Failed to start TelegramBot channel", { channelId: channel.id, error });
      }
    }
  }

  async stop() {
    await Promise.all(Array.from(this.bots.keys()).map((channelId) => this.stopInstance(channelId)));
  }

  async sendManualMessage(channelId: string | null | undefined, chatId: string, text: string) {
    return this.resolveBot(channelId).sendMessage(chatId, text);
  }

  async editMessage(channelId: string | null | undefined, chatId: string, messageId: string, text: string) {
    return this.resolveBot(channelId).editMessageText(text, {
      chat_id: chatId,
      message_id: Number(messageId),
    });
  }

  async getConnectionStatus(channel: ChannelConfig) {
    if (!channel.enabled) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "渠道已停用。",
      });
    }
    if (!channel.botToken?.trim()) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "请填写 TelegramBot Token。",
      });
    }

    const instance = this.bots.get(channel.id);
    if (instance) {
      try {
        await instance.bot.getMe();
        return this.setStatus(channel.id, {
          connected: true,
          needsLogin: false,
          message: "TelegramBot 已连接。",
        });
      } catch (error) {
        await this.stopInstance(channel.id);
        return this.restartAndReport(channel, formatTelegramBotError(error));
      }
    }

    return this.restartAndReport(channel, "TelegramBot 未运行，已尝试重启。");
  }

  private async startInstance(channel: ChannelConfig) {
    const bot = new TelegramBot(channel.botToken?.trim() ?? "", {
      polling: {
        autoStart: false,
        params: {
          timeout: 10,
        },
      },
    });

    const onMessage = async (message: TelegramBot.Message) => {
      await this.processMessage(channel.id, bot, message, false);
    };
    const onEditedMessage = async (message: TelegramBot.Message) => {
      await this.processMessage(channel.id, bot, message, true);
    };

    bot.on("message", onMessage);
    bot.on("edited_message", onEditedMessage);
    bot.on("polling_error", (error) => {
      this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: formatTelegramBotError(error),
      });
      console.error("Telegram polling error", { channelId: channel.id, error });
    });
    bot.on("webhook_error", (error) => {
      this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: formatTelegramBotError(error),
      });
      console.error("Telegram webhook error", { channelId: channel.id, error });
    });

    // A stale webhook on the same bot token can block long polling from receiving updates.
    await bot.deleteWebHook();
    await bot.startPolling();
    this.bots.set(channel.id, { channel, bot, onMessage, onEditedMessage });
    this.setStatus(channel.id, {
      connected: true,
      needsLogin: false,
      message: "TelegramBot 已连接。",
    });
  }

  private async stopInstance(channelId: string) {
    const instance = this.bots.get(channelId);
    if (!instance) {
      return;
    }

    instance.bot.removeListener("message", instance.onMessage);
    instance.bot.removeListener("edited_message", instance.onEditedMessage);
    await instance.bot.stopPolling();
    this.bots.delete(channelId);
  }

  private resolveBot(channelId: string | null | undefined) {
    if (channelId) {
      const bot = this.bots.get(channelId)?.bot;
      if (bot) {
        return bot;
      }
    }

    if (this.bots.size === 1) {
      return Array.from(this.bots.values())[0].bot;
    }

    throw new Error("Telegram bot is not started. Please complete the Telegram channel settings first.");
  }

  private async restartAndReport(channel: ChannelConfig, previousMessage: string) {
    try {
      await this.startInstance(channel);
      return this.setStatus(channel.id, {
        connected: true,
        needsLogin: false,
        message: "TelegramBot 已重启并连接。",
      });
    } catch (error) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: `${previousMessage} 重启失败：${formatTelegramBotError(error)}`,
      });
    }
  }

  private setStatus(
    channelId: string,
    status: Omit<ChannelConnectionStatus, "ok" | "checkedAt">,
  ): ChannelConnectionStatus {
    const nextStatus = {
      ok: true,
      ...status,
      checkedAt: new Date().toISOString(),
    } satisfies ChannelConnectionStatus;
    this.statuses.set(channelId, nextStatus);
    return nextStatus;
  }

  private async processMessage(
    channelId: string,
    bot: TelegramBot,
    message: TelegramBot.Message,
    isEdited = false,
  ) {
    try {
      const inboundText = message.text ?? message.caption;
      if (!inboundText || !message.from) {
        return;
      }

      const conversation = await this.conversations.findOrCreateTelegramConversation({
        channelId,
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

        if (reply) {
          await bot.sendMessage(message.chat.id, reply);
        }
      }
    } catch (error) {
      console.error("Failed to process Telegram message", {
        error,
        channelId,
        messageId: message.message_id,
        chatId: message.chat.id,
      });
    }
  }
}

function formatTelegramBotError(error: unknown) {
  if (error instanceof Error && error.message) {
    return `TelegramBot 连接异常：${error.message}`;
  }
  return "TelegramBot 连接异常。";
}
