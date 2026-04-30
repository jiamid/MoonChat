import { TelegramClient, Api } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/NewMessage.js";
import { returnBigInt } from "telegram/Helpers.js";
import { CustomFile } from "telegram/client/uploads.js";
import { StringSession } from "telegram/sessions/StringSession.js";
import type { ChannelConfig } from "../../../src/shared/contracts.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

const RECENT_HISTORY_LIMIT = 30;
const TELEGRAM_USER_API_ID = 34936987;
const TELEGRAM_USER_API_HASH = "224905010bbb75548bb767a1628c8ded";

type TelegramUserInstance = {
  channel: ChannelConfig;
  client: TelegramClient;
  onMessage: (event: NewMessageEvent) => Promise<void>;
};

type PendingLogin = {
  channel: ChannelConfig;
  client: TelegramClient;
  session: StringSession;
  phoneCodeHash: string;
};

type ChannelConnectionStatus = {
  ok: true;
  connected: boolean;
  needsLogin: boolean;
  message: string;
  checkedAt: string;
};

type ResolvedTelegramUser = {
  user: Api.User | null;
  inputEntity: Api.TypeInputPeer | null;
};

export class TelegramUserService {
  private readonly clients = new Map<string, TelegramUserInstance>();
  private readonly pendingLogins = new Map<string, PendingLogin>();
  private readonly statuses = new Map<string, ChannelConnectionStatus>();
  private readonly userEntityCache = new Map<string, ResolvedTelegramUser>();

  constructor(
    private readonly conversations: ConversationService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async reconfigure(channels: ChannelConfig[]) {
    const nextChannels = [...channels];
    const telegramUserChannels = nextChannels.filter(
      (channel) =>
        channel.type === "telegram_user" &&
        channel.enabled &&
        channel.phoneNumber?.trim(),
    );
    const activeIds = new Set(telegramUserChannels.map((channel) => channel.id));

    await Promise.all(
      Array.from(this.clients.values())
        .filter((instance) => !activeIds.has(instance.channel.id))
        .map((instance) => this.stopInstance(instance.channel.id)),
    );

    for (const channel of telegramUserChannels) {
      const existing = this.clients.get(channel.id);
      const stableChannel = sanitizeRuntimeChannel(channel);
      if (existing && JSON.stringify(sanitizeRuntimeChannel(existing.channel)) === JSON.stringify(stableChannel)) {
        existing.channel = channel;
        continue;
      }

      await this.stopInstance(channel.id);
      try {
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: false,
          message: "Telegram 私人账号正在后台启动。",
        });
        const sessionString = await this.startInstance(channel);
        if (sessionString && sessionString !== channel.sessionString) {
          const index = nextChannels.findIndex((item) => item.id === channel.id);
          if (index >= 0) {
            nextChannels[index] = {
              ...nextChannels[index],
              sessionString,
              loginCode: "",
              twoFactorPassword: "",
            };
          }
        }
      } catch (error) {
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: true,
          message: formatTelegramUserError(error),
        });
        console.error("Failed to start Telegram private account channel", {
          channelId: channel.id,
          error,
        });
      }
    }

    return nextChannels;
  }

  async requestLoginCode(channel: ChannelConfig) {
    const apiId = ensureApiId(channel);
    const apiHash = ensureApiHash(channel);
    const phoneNumber = ensurePhoneNumber(channel);

    await this.clearPendingLogin(channel.id);

    const session = new StringSession(channel.sessionString?.trim() || "");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });
    await client.connect();

    if (await client.checkAuthorization()) {
      const sessionString = session.save();
      await client.disconnect();
      return {
        ok: true,
        alreadyAuthorized: true,
        sessionString,
        isCodeViaApp: false,
      };
    }

    const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
      { apiId, apiHash },
      phoneNumber,
      false,
    );

    this.pendingLogins.set(channel.id, {
      channel,
      client,
      session,
      phoneCodeHash,
    });

    return {
      ok: true,
      alreadyAuthorized: false,
      sessionString: "",
      isCodeViaApp,
    };
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
    const client = this.resolveClient(channelId);
    const resolved = await this.resolvePrivateUser(client, channelId ?? "default", chatId);
    const entity = resolved.inputEntity ?? toPeerUser(chatId);
    const attachmentDataUrl = options?.attachmentDataUrl ?? options?.imageDataUrl;
    const attachmentMimeType = options?.attachmentMimeType ?? options?.imageMimeType;
    if (attachmentDataUrl) {
      const buffer = dataUrlToBuffer(attachmentDataUrl);
      const fileName = options?.attachmentFileName || `moonchat-file.${mimeToExtension(attachmentMimeType)}`;
      const file = new CustomFile(fileName, buffer.length, "", buffer);
      return client.sendFile(entity, {
        file,
        caption: text || undefined,
      });
    }
    return client.sendMessage(entity, { message: text });
  }

  async syncRecentHistory(input: {
    channelId: string | null | undefined;
    chatId: string;
    conversationId: string;
    fallbackSenderId: string;
  }) {
    const client = this.resolveClient(input.channelId);
    const resolved = await this.resolvePrivateUser(
      client,
      input.channelId ?? "default",
      input.fallbackSenderId || input.chatId,
    );
    const syncedCount = await this.syncRecentPrivateHistory({
      client,
      channelId: input.channelId ?? "default",
      chatId: input.chatId,
      conversationId: input.conversationId,
      fallbackSenderId: input.fallbackSenderId || input.chatId,
      inputEntity: resolved.inputEntity,
      throwOnError: true,
    });
    this.conversations.notifyChanged(input.conversationId);
    return { ok: true, syncedCount };
  }

  async getConnectionStatus(channel: ChannelConfig) {
    if (!channel.enabled) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "渠道已停用。",
      });
    }
    if (!channel.phoneNumber?.trim()) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: true,
        message: "请完善 Telegram 私人账号配置。",
      });
    }
    if (!channel.sessionString?.trim() && !this.pendingLogins.has(channel.id)) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: true,
        message: "Telegram 私人账号未登录，请发送验证码并完成登录。",
      });
    }

    if (this.clients.has(channel.id)) {
      return this.setStatus(channel.id, {
        connected: true,
        needsLogin: false,
        message: "Telegram 私人账号已连接。",
      });
    }

    return (
      this.statuses.get(channel.id) ??
      this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "Telegram 私人账号正在后台启动。",
      })
    );
  }

  async stop() {
    await Promise.all(Array.from(this.clients.keys()).map((channelId) => this.stopInstance(channelId)));
    await Promise.all(Array.from(this.pendingLogins.keys()).map((channelId) => this.clearPendingLogin(channelId)));
  }

  private async startInstance(channel: ChannelConfig) {
    const apiId = ensureApiId(channel);
    const apiHash = ensureApiHash(channel);
    ensurePhoneNumber(channel);

    const pending = this.pendingLogins.get(channel.id);
    const session = pending?.session ?? new StringSession(channel.sessionString?.trim() || "");
    const client = pending?.client ?? new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });
    if (!client.connected) {
      await client.connect();
    }

    if (!(await client.checkAuthorization())) {
      await this.completeLogin(channel, client);
    }

    const onMessage = async (event: NewMessageEvent) => {
      await this.processMessage(channel.id, event);
    };
    client.addEventHandler(onMessage, new NewMessage({ incoming: true }));
    this.clients.set(channel.id, { channel, client, onMessage });
    this.pendingLogins.delete(channel.id);
    this.setStatus(channel.id, {
      connected: true,
      needsLogin: false,
      message: "Telegram 私人账号已连接。",
    });
    return session.save();
  }

  private async completeLogin(channel: ChannelConfig, client: TelegramClient) {
    const pending = this.pendingLogins.get(channel.id);
    const phoneNumber = ensurePhoneNumber(channel);
    const loginCode = channel.loginCode?.trim();

    if (!pending) {
      throw new Error("请先点击“发送验证码”，收到验证码后再保存渠道。");
    }
    if (!loginCode) {
      throw new Error("请输入 Telegram 发送的验证码后再保存渠道。");
    }

    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: loginCode,
        }),
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new Error("该手机号尚未注册 Telegram，MoonChat 不支持创建新 Telegram 账号。");
      }
    } catch (error) {
      if (isTelegramError(error, "SESSION_PASSWORD_NEEDED")) {
        const password = channel.twoFactorPassword?.trim();
        if (!password) {
          throw new Error("该账号开启了两步验证，请输入 Telegram 2FA 密码后再次保存。");
        }
        await client.signInWithPassword(
          { apiId: ensureApiId(channel), apiHash: ensureApiHash(channel) },
          {
            password: async () => password,
            onError: async (passwordError) => {
              throw passwordError;
            },
          },
        );
        return;
      }

      throw error;
    }
  }

  private async stopInstance(channelId: string) {
    const instance = this.clients.get(channelId);
    if (!instance) {
      return;
    }

    await instance.client.destroy();
    this.clients.delete(channelId);
  }

  private async clearPendingLogin(channelId: string) {
    const pending = this.pendingLogins.get(channelId);
    if (!pending) {
      return;
    }

    await pending.client.disconnect();
    this.pendingLogins.delete(channelId);
  }

  private resolveClient(channelId: string | null | undefined) {
    if (channelId) {
      const client = this.clients.get(channelId)?.client;
      if (client) {
        return client;
      }
    }

    if (this.clients.size === 1) {
      return Array.from(this.clients.values())[0].client;
    }

    throw new Error("Telegram private account is not connected. Please complete the channel login first.");
  }

  private async restartAndReport(channel: ChannelConfig, previousMessage: string) {
    try {
      await this.startInstance(channel);
      return this.setStatus(channel.id, {
        connected: true,
        needsLogin: false,
        message: "Telegram 私人账号已重启并连接。",
      });
    } catch (error) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: true,
        message: `${previousMessage} 重启失败：${formatTelegramUserError(error)}`,
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

  private async processMessage(channelId: string, event: NewMessageEvent) {
    try {
      const message = event.message;
      const inboundText = message.message ?? "";
      const chatId = event.chatId?.toString();
      const senderId = message.senderId?.toString() ?? chatId;
      if (chatId?.startsWith("-")) {
        return;
      }
      if (!chatId || !senderId || !event.client) {
        return;
      }
      const attachment = await downloadTelegramUserMedia(event.client, message);
      const replyToMessageId = getTelegramUserReplyToMessageId(message);
      const messageText = inboundText || describeTelegramUserMessage(message, attachment);
      if (!messageText && !attachment?.dataUrl && !replyToMessageId) {
        return;
      }

      const sender = message.sender;
      const resolved = await this.resolvePrivateUser(event.client, channelId, senderId);
      const user = sender instanceof Api.User ? sender : resolved.user;
      if (user?.self) {
        return;
      }

      const displayName = formatTelegramUserName(user) || `Telegram User ${senderId}`;
      const conversation = await this.conversations.findOrCreateTelegramUserConversation({
        channelId,
        chatId,
        title: displayName,
        externalUserId: senderId,
        username: user?.username,
      });

      await this.syncRecentPrivateHistory({
        client: event.client,
        channelId,
        chatId,
        conversationId: conversation.id,
        fallbackSenderId: senderId,
        inputEntity: resolved.inputEntity,
      });

      await this.conversations.upsertTelegramUserMessage({
        conversationId: conversation.id,
        externalMessageId: String(message.id),
        senderId,
        text: messageText,
        messageRole: "inbound",
        senderType: "user",
        createdAt: formatTelegramMessageDate(message.date),
        attachmentDataUrl: attachment?.dataUrl,
        attachmentKind: attachment?.kind,
        attachmentMimeType: attachment?.mimeType,
        attachmentFileName: attachment?.fileName,
        replyToMessageId,
      });

      const reply = await this.ai.handlePotentialAutoReply({
        conversationId: conversation.id,
        senderId,
        inboundText: messageText || `[${attachment?.kind ?? "消息"}]`,
      });

      if (reply) {
        const sent = await this.sendManualMessage(channelId, chatId, reply.text);
        await this.conversations.attachExternalMessageIdToMessage({
          messageId: reply.messageId,
          externalMessageId: String(sent.id),
          sourceType: "telegram_user",
        });
      }
    } catch (error) {
      console.error("Failed to process Telegram private account message", {
        error,
        channelId,
      });
    }
  }

  private async syncRecentPrivateHistory(input: {
    client: TelegramClient;
    channelId: string;
    chatId: string;
    conversationId: string;
    fallbackSenderId: string;
    inputEntity: Api.TypeInputPeer | null;
    throwOnError?: boolean;
  }) {
    let syncedCount = 0;
    try {
      const history = await input.client.getMessages(input.inputEntity ?? toPeerUser(input.chatId), {
        limit: RECENT_HISTORY_LIMIT,
      });
      const ordered = [...history].sort((left, right) => Number(left.id) - Number(right.id));

      for (const message of ordered) {
        if (!(message instanceof Api.Message)) {
          continue;
        }
        const attachment = await downloadTelegramUserMedia(input.client, message);
        const replyToMessageId = getTelegramUserReplyToMessageId(message);
        const messageText = message.message?.trim() || describeTelegramUserMessage(message, attachment);
        if (!messageText && !attachment?.dataUrl && !replyToMessageId) {
          continue;
        }

        const isOutbound = Boolean(message.out);
        await this.conversations.upsertTelegramUserMessage({
          conversationId: input.conversationId,
          externalMessageId: String(message.id),
          senderId: message.senderId?.toString() ?? (isOutbound ? "telegram-user-self" : input.fallbackSenderId),
          text: messageText,
          messageRole: isOutbound ? "outbound" : "inbound",
          senderType: isOutbound ? "human_agent" : "user",
          createdAt: formatTelegramMessageDate(message.date),
          attachmentDataUrl: attachment?.dataUrl,
          attachmentKind: attachment?.kind,
          attachmentMimeType: attachment?.mimeType,
          attachmentFileName: attachment?.fileName,
          replyToMessageId,
        });
        syncedCount += 1;
      }
      return syncedCount;
    } catch (error) {
      console.error("Failed to sync Telegram private account history", {
        error,
        channelId: input.channelId,
        chatId: input.chatId,
      });
      if (input.throwOnError) {
        throw error;
      }
      return 0;
    }
  }

  private async resolvePrivateUser(
    client: TelegramClient,
    channelId: string,
    userId: string,
  ): Promise<ResolvedTelegramUser> {
    const cacheKey = `${channelId}:${userId}`;
    const cached = this.userEntityCache.get(cacheKey);
    if (cached?.inputEntity) {
      return cached;
    }

    try {
      const dialogs = await client.getDialogs({ limit: 100 });
      for (const dialog of dialogs) {
        if (!(dialog.entity instanceof Api.User) || dialog.entity.id.toString() !== userId) {
          continue;
        }

        const resolved = {
          user: dialog.entity,
          inputEntity: dialog.inputEntity,
        };
        this.userEntityCache.set(cacheKey, resolved);
        return resolved;
      }
    } catch (error) {
      console.error("Failed to resolve Telegram private user entity", {
        error,
        channelId,
        userId,
      });
    }

    const fallback = { user: null, inputEntity: null };
    this.userEntityCache.set(cacheKey, fallback);
    return fallback;
  }
}

function ensureApiId(channel: ChannelConfig) {
  return TELEGRAM_USER_API_ID;
}

function ensureApiHash(channel: ChannelConfig) {
  return TELEGRAM_USER_API_HASH;
}

function ensurePhoneNumber(channel: ChannelConfig) {
  const phoneNumber = channel.phoneNumber?.trim();
  if (!phoneNumber) {
    throw new Error("请填写 Telegram 私人账号手机号。");
  }
  return phoneNumber;
}

function sanitizeRuntimeChannel(channel: ChannelConfig) {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    phoneNumber: channel.phoneNumber,
    sessionString: channel.sessionString,
    enabled: channel.enabled,
  };
}

function isTelegramError(error: unknown, errorMessage: string) {
  return (
    Boolean(error) &&
    error !== null &&
    typeof error === "object" &&
    "errorMessage" in error &&
    (error as { errorMessage?: string }).errorMessage === errorMessage
  );
}

function formatTelegramUserError(error: unknown) {
  if (error instanceof Error && error.message) {
    return `Telegram 私人账号连接异常：${error.message}`;
  }
  if (isTelegramError(error, "AUTH_KEY_UNREGISTERED")) {
    return "Telegram 私人账号登录已失效，请重新登录。";
  }
  return "Telegram 私人账号连接异常。";
}

function formatTelegramUserName(user: Api.User | null) {
  if (!user) {
    return "";
  }

  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || "";
}

function formatTelegramMessageDate(date: number | undefined) {
  return date ? new Date(date * 1000).toISOString() : undefined;
}

function toPeerUser(userId: string) {
  return new Api.PeerUser({ userId: returnBigInt(userId) });
}

type TelegramAttachment = {
  kind: "image" | "audio" | "video" | "file";
  dataUrl: string;
  mimeType: string;
  fileName?: string;
};

async function downloadTelegramUserMedia(client: TelegramClient, message: Api.Message): Promise<TelegramAttachment | undefined> {
  const isPhoto = message.media instanceof Api.MessageMediaPhoto;
  const document =
    message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document
      ? message.media.document
      : null;

  if (!isPhoto && !document) {
    return undefined;
  }

  const media = await client.downloadMedia(message, {});
  if (!media) {
    return undefined;
  }

  const buffer = Buffer.isBuffer(media) ? media : Buffer.from(media);
  const mimeType = document?.mimeType || "image/jpeg";
  return {
    kind: inferAttachmentKind(mimeType),
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    mimeType,
    fileName: document ? getTelegramDocumentFileName(document) : undefined,
  };
}

function dataUrlToBuffer(dataUrl: string) {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Buffer.from(base64, "base64");
}

function mimeToExtension(mimeType: string | undefined) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType === "text/plain") {
    return "txt";
  }
  if (mimeType?.includes("wordprocessingml") || mimeType === "application/msword") {
    return "docx";
  }
  if (mimeType?.includes("spreadsheetml") || mimeType === "application/vnd.ms-excel") {
    return "xlsx";
  }
  if (mimeType?.startsWith("audio/")) {
    return mimeType.includes("ogg") ? "ogg" : "mp3";
  }
  if (mimeType?.startsWith("video/")) {
    return "mp4";
  }
  if (mimeType?.startsWith("image/")) {
    return "jpg";
  }
  return "bin";
}

function inferAttachmentKind(mimeType: string | undefined): TelegramAttachment["kind"] {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  return "file";
}

function getTelegramDocumentFileName(document: Api.Document) {
  const fileNameAttribute = document.attributes.find(
    (attribute): attribute is Api.DocumentAttributeFilename =>
      attribute instanceof Api.DocumentAttributeFilename,
  );
  return fileNameAttribute?.fileName;
}

function getTelegramUserReplyToMessageId(message: Api.Message) {
  const replyTo = message.replyTo;
  if (replyTo instanceof Api.MessageReplyHeader) {
    return replyTo.replyToMsgId ? String(replyTo.replyToMsgId) : undefined;
  }
  return undefined;
}

function describeTelegramUserMessage(message: Api.Message, attachment: TelegramAttachment | undefined) {
  if (attachment?.kind === "image") return "[图片]";
  if (attachment?.kind === "audio") return "[音频]";
  if (attachment?.kind === "video") return "[视频]";
  if (attachment?.kind === "file") return `[文件${attachment.fileName ? `：${attachment.fileName}` : ""}]`;
  if (message.media instanceof Api.MessageMediaGeo || message.media instanceof Api.MessageMediaVenue) return "[位置]";
  if (message.media instanceof Api.MessageMediaContact) return "[联系人]";
  if (message.media instanceof Api.MessageMediaPoll) return "[投票]";
  return "";
}
