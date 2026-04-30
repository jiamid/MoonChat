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
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: false,
          message: "TelegramBot 正在后台启动。",
        });
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

  async sendManualMessage(
    channelId: string | null | undefined,
    chatId: string,
    text: string,
    options?: {
      imageDataUrl?: string;
      imageMimeType?: string;
      attachmentDataUrl?: string;
      attachmentMimeType?: string;
      attachmentKind?: string;
      attachmentFileName?: string;
    },
  ) {
    const bot = this.resolveBot(channelId);
    const attachmentDataUrl = options?.attachmentDataUrl ?? options?.imageDataUrl;
    const attachmentMimeType = options?.attachmentMimeType ?? options?.imageMimeType;
    const attachmentKind = options?.attachmentKind ?? inferAttachmentKind(attachmentMimeType, "file");
    if (attachmentDataUrl) {
      const buffer = dataUrlToBuffer(attachmentDataUrl);
      const caption = text || undefined;
      if (attachmentKind === "image") {
        return bot.sendPhoto(chatId, buffer, { caption });
      }
      if (attachmentKind === "audio") {
        return bot.sendAudio(chatId, buffer, { caption }, { filename: options?.attachmentFileName });
      }
      if (attachmentKind === "video") {
        return bot.sendVideo(chatId, buffer, { caption }, { filename: options?.attachmentFileName });
      }
      return bot.sendDocument(chatId, buffer, { caption }, { filename: options?.attachmentFileName });
    }
    return bot.sendMessage(chatId, text);
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

    if (this.bots.has(channel.id)) {
      return this.setStatus(channel.id, {
        connected: true,
        needsLogin: false,
        message: "TelegramBot 已连接。",
      });
    }

    return (
      this.statuses.get(channel.id) ??
      this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "TelegramBot 正在后台启动。",
      })
    );
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
      const inboundText = message.text ?? message.caption ?? "";
      if (!message.from) {
        return;
      }
      const attachment = await downloadTelegramBotMedia(bot, message);
      const replyToMessageId = message.reply_to_message?.message_id
        ? String(message.reply_to_message.message_id)
        : undefined;
      const messageText = inboundText || describeTelegramBotMessage(message, attachment);
      if (!messageText && !attachment?.dataUrl && !replyToMessageId) {
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
          text: messageText,
          replyToMessageId,
        });
      } else {
        await this.conversations.appendInboundTelegramMessage({
          conversationId: conversation.id,
          externalMessageId: String(message.message_id),
          senderId: String(message.from.id),
          text: messageText,
          attachmentDataUrl: attachment?.dataUrl,
          attachmentKind: attachment?.kind,
          attachmentMimeType: attachment?.mimeType,
          attachmentFileName: attachment?.fileName,
          replyToMessageId,
        });
      }

      if (!isEdited) {
        const reply = await this.ai.handlePotentialAutoReply({
          conversationId: conversation.id,
          senderId: String(message.from.id),
          inboundText: messageText || `[${attachment?.kind ?? "消息"}]`,
        });

        if (reply) {
          const sent = await bot.sendMessage(message.chat.id, reply.text);
          await this.conversations.attachExternalMessageIdToMessage({
            messageId: reply.messageId,
            externalMessageId: String(sent.message_id),
            sourceType: "telegram",
          });
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

type TelegramAttachment = {
  kind: "image" | "audio" | "video" | "file";
  dataUrl: string;
  mimeType: string;
  fileName?: string;
};

async function downloadTelegramBotMedia(bot: TelegramBot, message: TelegramBot.Message): Promise<TelegramAttachment | undefined> {
  const candidate = getTelegramBotMediaCandidate(message);
  if (!candidate) {
    return undefined;
  }

  const { fileId, kind, mimeType, fileName } = candidate;
  if (!fileId) {
    return undefined;
  }

  const link = await bot.getFileLink(fileId);
  const response = await fetch(link);
  if (!response.ok) {
    throw new Error(`下载 Telegram 图片失败：${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const resolvedMimeType = response.headers.get("content-type")?.split(";")[0] || mimeType;
  return {
    kind: inferAttachmentKind(resolvedMimeType, kind),
    dataUrl: `data:${resolvedMimeType};base64,${buffer.toString("base64")}`,
    mimeType: resolvedMimeType,
    fileName,
  };
}

function getTelegramBotMediaCandidate(message: TelegramBot.Message) {
  const photo = message.photo?.at(-1);
  if (photo) {
    return { fileId: photo.file_id, kind: "image" as const, mimeType: "image/jpeg" };
  }
  if (message.voice) {
    return { fileId: message.voice.file_id, kind: "audio" as const, mimeType: message.voice.mime_type ?? "audio/ogg" };
  }
  if (message.audio) {
    return {
      fileId: message.audio.file_id,
      kind: "audio" as const,
      mimeType: message.audio.mime_type ?? "audio/mpeg",
      fileName: getTelegramBotFileName(message.audio),
    };
  }
  if (message.video) {
    return {
      fileId: message.video.file_id,
      kind: "video" as const,
      mimeType: message.video.mime_type ?? "video/mp4",
      fileName: getTelegramBotFileName(message.video),
    };
  }
  if (message.video_note) {
    return { fileId: message.video_note.file_id, kind: "video" as const, mimeType: "video/mp4" };
  }
  if (message.animation) {
    return {
      fileId: message.animation.file_id,
      kind: "video" as const,
      mimeType: message.animation.mime_type ?? "video/mp4",
      fileName: getTelegramBotFileName(message.animation),
    };
  }
  if (message.document) {
    return {
      fileId: message.document.file_id,
      kind: inferAttachmentKind(message.document.mime_type, "file"),
      mimeType: message.document.mime_type ?? "application/octet-stream",
      fileName: message.document.file_name,
    };
  }
  if (message.sticker) {
    return {
      fileId: message.sticker.file_id,
      kind: "image" as const,
      mimeType: message.sticker.is_video ? "video/webm" : "image/webp",
      fileName: getTelegramBotFileName(message.sticker),
    };
  }
  return undefined;
}

function getTelegramBotFileName(value: unknown) {
  return typeof value === "object" && value !== null && "file_name" in value
    ? String((value as { file_name?: string }).file_name ?? "")
    : undefined;
}

function inferAttachmentKind(mimeType: string | undefined, fallback: "image" | "audio" | "video" | "file") {
  if (mimeType?.startsWith("image/")) {
    return "image" as const;
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio" as const;
  }
  if (mimeType?.startsWith("video/")) {
    return "video" as const;
  }
  return fallback;
}

function describeTelegramBotMessage(message: TelegramBot.Message, attachment: TelegramAttachment | undefined) {
  if (attachment?.kind === "image" || attachment?.kind === "audio" || attachment?.kind === "video") return "";
  if (attachment?.kind === "file") return `[文件${attachment.fileName ? `：${attachment.fileName}` : ""}]`;
  if (message.contact) return "[联系人]";
  if (message.location || message.venue) return "[位置]";
  if (message.poll) return `[投票：${message.poll.question}]`;
  if (message.sticker) return "[贴纸]";
  return "";
}

function dataUrlToBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Buffer.from(base64, "base64");
}
