import { TelegramClient, Api } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events/NewMessage.js";
import { StringSession } from "telegram/sessions/StringSession.js";
import type { ChannelConfig } from "../../../src/shared/contracts.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

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

export class TelegramUserService {
  private readonly clients = new Map<string, TelegramUserInstance>();
  private readonly pendingLogins = new Map<string, PendingLogin>();
  private readonly statuses = new Map<string, ChannelConnectionStatus>();

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
        channel.apiId &&
        channel.apiHash?.trim() &&
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

  async sendManualMessage(channelId: string | null | undefined, chatId: string, text: string) {
    const client = this.resolveClient(channelId);
    return client.sendMessage(chatId, { message: text });
  }

  async getConnectionStatus(channel: ChannelConfig) {
    if (!channel.enabled) {
      return this.setStatus(channel.id, {
        connected: false,
        needsLogin: false,
        message: "渠道已停用。",
      });
    }
    if (!channel.apiId || !channel.apiHash?.trim() || !channel.phoneNumber?.trim()) {
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

    const instance = this.clients.get(channel.id);
    if (instance) {
      try {
        if (!instance.client.connected) {
          await instance.client.connect();
        }
        if (await instance.client.checkAuthorization()) {
          return this.setStatus(channel.id, {
            connected: true,
            needsLogin: false,
            message: "Telegram 私人账号已连接。",
          });
        }
        await this.stopInstance(channel.id);
        return this.setStatus(channel.id, {
          connected: false,
          needsLogin: true,
          message: "Telegram 私人账号登录已失效，请重新登录。",
        });
      } catch (error) {
        await this.stopInstance(channel.id);
        return this.restartAndReport(channel, formatTelegramUserError(error));
      }
    }

    return this.restartAndReport(channel, "Telegram 私人账号未运行，已尝试重启。");
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
      if (!event.isPrivate) {
        return;
      }

      const message = event.message;
      const inboundText = message.message;
      const chatId = event.chatId?.toString();
      const senderId = message.senderId?.toString() ?? chatId;
      if (!inboundText || !chatId || !senderId) {
        return;
      }

      const sender = message.senderId && event.client
        ? await event.client.getEntity(message.senderId)
        : undefined;
      const user = sender instanceof Api.User ? sender : null;
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

      await this.conversations.appendInboundTelegramMessage({
        conversationId: conversation.id,
        externalMessageId: String(message.id),
        senderId,
        text: inboundText,
        sourceType: "telegram_user",
      });

      const reply = await this.ai.handlePotentialAutoReply({
        conversationId: conversation.id,
        senderId,
        inboundText,
      });

      if (reply) {
        await this.sendManualMessage(channelId, chatId, reply);
      }
    } catch (error) {
      console.error("Failed to process Telegram private account message", {
        error,
        channelId,
      });
    }
  }
}

function ensureApiId(channel: ChannelConfig) {
  if (!channel.apiId || Number.isNaN(channel.apiId)) {
    throw new Error("请填写 Telegram API ID。");
  }
  return Number(channel.apiId);
}

function ensureApiHash(channel: ChannelConfig) {
  const apiHash = channel.apiHash?.trim();
  if (!apiHash) {
    throw new Error("请填写 Telegram API Hash。");
  }
  return apiHash;
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
    apiId: channel.apiId,
    apiHash: channel.apiHash,
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
