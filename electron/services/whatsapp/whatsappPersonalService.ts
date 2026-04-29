import path from "node:path";
import fs from "node:fs/promises";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  extractMessageContent,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type ConnectionState,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";
import type { ChannelConfig } from "../../../src/shared/contracts.js";
import type { ConversationService } from "../storage/conversationService.js";
import type { AiOrchestratorService } from "../orchestration/aiOrchestratorService.js";

type WhatsappInstance = {
  channel: ChannelConfig;
  socket: WASocket;
  qrDataUrl: string;
  lastConnectionError: string;
  qrWaiters: Array<(qrDataUrl: string) => void>;
  unsubscribe?: () => void;
};

type StartOptions = {
  reconnectOnClose?: boolean;
};

type WhatsappConnectionStatus = {
  ok: true;
  connected: boolean;
  needsLogin: boolean;
  message: string;
  checkedAt: string;
};

export class WhatsappPersonalService {
  private readonly clients = new Map<string, WhatsappInstance>();
  private readonly statuses = new Map<string, WhatsappConnectionStatus>();

  constructor(
    private readonly dataDir: string,
    private readonly conversations: ConversationService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async reconfigure(channels: ChannelConfig[]) {
    const nextChannels = [...channels];
    const whatsappChannels = nextChannels.filter(
      (channel) => channel.type === "whatsapp_personal" && channel.enabled,
    );
    const activeIds = new Set(whatsappChannels.map((channel) => channel.id));

    await Promise.all(
      Array.from(this.clients.values())
        .filter((instance) => !activeIds.has(instance.channel.id))
        .map((instance) => this.stopInstance(instance.channel.id)),
    );

    for (const channel of whatsappChannels) {
      const existing = this.clients.get(channel.id);
      if (existing && existing.channel.authStatePath === channel.authStatePath) {
        existing.channel = channel;
        continue;
      }

      await this.stopInstance(channel.id);
      const authStatePath = channel.authStatePath?.trim() || this.getDefaultAuthStatePath(channel.id);
      const qrDataUrl = await this.startInstance({ ...channel, authStatePath });
      const index = nextChannels.findIndex((item) => item.id === channel.id);
      if (index >= 0) {
        nextChannels[index] = {
          ...nextChannels[index],
          authStatePath,
          lastQrDataUrl: qrDataUrl,
        };
      }
    }

    return nextChannels;
  }

  async requestQr(channel: ChannelConfig) {
    const authStatePath = channel.authStatePath?.trim() || this.getDefaultAuthStatePath(channel.id);
    await this.stopInstance(channel.id);
    await fs.rm(authStatePath, { recursive: true, force: true });
    let qrDataUrl = await this.startInstance({ ...channel, authStatePath, lastQrDataUrl: "" });
    if (!qrDataUrl && !this.clients.get(channel.id)?.socket.user) {
      qrDataUrl = await this.waitForQr(channel.id, 30000);
    }
    const instance = this.clients.get(channel.id);
    if (!qrDataUrl && !instance?.socket.user) {
      throw new Error(
        instance?.lastConnectionError ||
          "WhatsApp 没有返回二维码。请确认网络可访问 WhatsApp Web 后再重试。",
      );
    }
    return {
      ok: true,
      authStatePath,
      qrDataUrl,
      connected: Boolean(this.clients.get(channel.id)?.socket.user),
    };
  }

  async sendManualMessage(channelId: string | null | undefined, chatId: string, text: string) {
    const socket = this.resolveSocket(channelId);
    return socket.sendMessage(chatId, { text });
  }

  getConnectionStatus(channelId: string) {
    const socket = this.clients.get(channelId)?.socket as
      | (WASocket & { authState?: { creds?: { registered?: boolean } } })
      | undefined;
    const connected = Boolean(socket?.user || socket?.authState?.creds?.registered);
    if (connected) {
      return this.setStatus(channelId, {
        connected: true,
        needsLogin: false,
        message: "WhatsApp 已连接。",
      });
    }
    return (
      this.statuses.get(channelId) ??
      this.setStatus(channelId, {
        connected: false,
        needsLogin: true,
        message: "WhatsApp 未连接，请重新扫码登录。",
      })
    );
  }

  async stop() {
    await Promise.all(Array.from(this.clients.keys()).map((channelId) => this.stopInstance(channelId)));
  }

  private async startInstance(channel: ChannelConfig, options: StartOptions = {}) {
    await fs.mkdir(channel.authStatePath ?? this.getDefaultAuthStatePath(channel.id), {
      recursive: true,
    });

    const authStatePath = channel.authStatePath ?? this.getDefaultAuthStatePath(channel.id);
    const { state, saveCreds } = await useMultiFileAuthState(authStatePath);
    let currentQrDataUrl = this.clients.get(channel.id)?.qrDataUrl ?? channel.lastQrDataUrl ?? "";
    this.setStatus(channel.id, {
      connected: false,
      needsLogin: true,
      message: "正在连接 WhatsApp Web。",
    });
    const version = await this.resolveBaileysVersion();

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys),
      },
      browser: Browsers.macOS("MoonChat"),
      ...(version ? { version } : {}),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      qrTimeout: 30000,
    });

    const handleConnectionUpdate = async (update: Partial<ConnectionState>) => {
      if (update.qr) {
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: true,
          message: "等待手机 WhatsApp 扫码登录。",
        });
        currentQrDataUrl = await qrcode.toDataURL(update.qr, {
          margin: 1,
          width: 320,
        });
        const instance = this.clients.get(channel.id);
        if (instance) {
          instance.qrDataUrl = currentQrDataUrl;
          const waiters = instance.qrWaiters.splice(0);
          for (const resolve of waiters) {
            resolve(currentQrDataUrl);
          }
        }
      }

      if (update.connection === "open") {
        this.setStatus(channel.id, {
          connected: true,
          needsLogin: false,
          message: "WhatsApp 已连接。",
        });
      }

      if (update.connection === "close") {
        const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
        const connectionMessage = formatDisconnectError(update.lastDisconnect?.error);
        this.setStatus(channel.id, {
          connected: false,
          needsLogin: true,
          message: connectionMessage,
        });
        const instance = this.clients.get(channel.id);
        if (instance) {
          instance.lastConnectionError = connectionMessage;
          const waiters = instance.qrWaiters.splice(0);
          for (const resolve of waiters) {
            resolve("");
          }
        }
        this.clients.delete(channel.id);
        if (options.reconnectOnClose !== false && statusCode !== DisconnectReason.loggedOut) {
          void this.startInstance(channel, options).catch((error) => {
            console.error("Failed to reconnect WhatsApp personal channel", {
              channelId: channel.id,
              error,
            });
          });
        }
      }
    };

    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", handleConnectionUpdate);
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") {
        return;
      }
      for (const message of messages) {
        await this.processMessage(channel.id, message);
      }
    });

    this.clients.set(channel.id, {
      channel,
      socket,
      qrDataUrl: currentQrDataUrl,
      lastConnectionError: "",
      qrWaiters: [],
      unsubscribe: () => {
        socket.ev.off("creds.update", saveCreds);
        socket.ev.off("connection.update", handleConnectionUpdate);
      },
    });

    return currentQrDataUrl;
  }

  private async waitForQr(channelId: string, timeoutMs: number) {
    const instance = this.clients.get(channelId);
    if (!instance) {
      return "";
    }
    if (instance.qrDataUrl) {
      return instance.qrDataUrl;
    }

    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        const index = instance.qrWaiters.indexOf(resolve);
        if (index >= 0) {
          instance.qrWaiters.splice(index, 1);
        }
        resolve("");
      }, timeoutMs);

      instance.qrWaiters.push((qrDataUrl) => {
        clearTimeout(timer);
        resolve(qrDataUrl);
      });
    });
  }

  private async stopInstance(channelId: string) {
    const instance = this.clients.get(channelId);
    if (!instance) {
      return;
    }

    instance.unsubscribe?.();
    instance.socket.ws.close();
    this.clients.delete(channelId);
  }

  private resolveSocket(channelId: string | null | undefined) {
    if (channelId) {
      const socket = this.clients.get(channelId)?.socket;
      if (socket) {
        return socket;
      }
    }

    if (this.clients.size === 1) {
      return Array.from(this.clients.values())[0].socket;
    }

    throw new Error("WhatsApp private account is not connected. Please scan the QR code first.");
  }

  private async processMessage(channelId: string, message: WAMessage) {
    try {
      const remoteJid = jidNormalizedUser(message.key.remoteJid ?? undefined);
      if (!remoteJid || message.key.fromMe || !remoteJid.endsWith("@s.whatsapp.net")) {
        return;
      }

      const inboundText = extractWhatsappText(message);
      if (!inboundText) {
        return;
      }

      const title = message.pushName || formatWhatsappUserId(remoteJid);
      const conversation = await this.conversations.findOrCreateWhatsappConversation({
        channelId,
        chatId: remoteJid,
        title,
        externalUserId: formatWhatsappUserId(remoteJid),
      });

      await this.conversations.appendInboundTelegramMessage({
        conversationId: conversation.id,
        externalMessageId: message.key.id ?? crypto.randomUUID(),
        senderId: remoteJid,
        text: inboundText,
        sourceType: "whatsapp_personal",
      });

      const reply = await this.ai.handlePotentialAutoReply({
        conversationId: conversation.id,
        senderId: remoteJid,
        inboundText,
      });

      if (reply) {
        await this.sendManualMessage(channelId, remoteJid, reply);
      }
    } catch (error) {
      console.error("Failed to process WhatsApp private account message", {
        error,
        channelId,
      });
    }
  }

  private getDefaultAuthStatePath(channelId: string) {
    return path.join(this.dataDir, "whatsapp-auth", channelId);
  }

  private setStatus(
    channelId: string,
    status: Omit<WhatsappConnectionStatus, "ok" | "checkedAt">,
  ): WhatsappConnectionStatus {
    const nextStatus = {
      ok: true,
      ...status,
      checkedAt: new Date().toISOString(),
    } satisfies WhatsappConnectionStatus;
    this.statuses.set(channelId, nextStatus);
    return nextStatus;
  }

  private async resolveBaileysVersion() {
    try {
      const { version } = await fetchLatestBaileysVersion();
      return version;
    } catch (error) {
      console.warn("Failed to fetch latest Baileys WhatsApp Web version, using bundled default", error);
      return undefined;
    }
  }
}

function extractWhatsappText(message: WAMessage) {
  const content = extractMessageContent(message.message);
  return (
    content?.conversation ||
    content?.extendedTextMessage?.text ||
    content?.imageMessage?.caption ||
    content?.videoMessage?.caption ||
    content?.buttonsResponseMessage?.selectedDisplayText ||
    content?.listResponseMessage?.title ||
    content?.listResponseMessage?.description ||
    ""
  ).trim();
}

function formatWhatsappUserId(jid: string) {
  return jid.replace(/@s\.whatsapp\.net$/, "");
}

function getDisconnectStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const output = (error as { output?: { statusCode?: number } }).output;
  return output?.statusCode;
}

function formatDisconnectError(error: unknown) {
  const statusCode = getDisconnectStatusCode(error);
  if (statusCode) {
    return `WhatsApp Web 连接已关闭（状态码 ${statusCode}），没有返回二维码。请确认网络可访问 WhatsApp Web 后再重试。`;
  }
  if (error instanceof Error && error.message) {
    return `WhatsApp Web 连接失败：${error.message}`;
  }
  return "WhatsApp Web 连接失败，没有返回二维码。";
}
