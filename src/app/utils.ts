import type {
  ChannelConfig,
  ConversationMessage,
  ConversationSummary,
  KnowledgeDocumentSummary,
  MemoryEntry,
} from "../shared/contracts";
import type { AiTab, AppView, ChannelConnectionStatus, RenderAttachment } from "./types";
import {
  aiTabStorageKey,
  chatReadAtStoragePrefix,
  dayMessageGroupFormatter,
  messageDateTimeFormatter,
  olderConversationTimeFormatter,
  sameDayConversationTimeFormatter,
  workspaceViewStorageKey,
} from "./constants";

export function getMessageAttachment(message: ConversationMessage): RenderAttachment | null {
  const dataUrl = message.attachmentDataUrl || message.attachmentImageDataUrl;
  if (!dataUrl) {
    return null;
  }

  const mimeType = message.attachmentMimeType || getDataUrlMimeType(dataUrl);
  return {
    kind: message.attachmentKind || inferAttachmentKind(mimeType),
    dataUrl,
    mimeType,
    fileName: message.attachmentFileName,
  };
}

export function chatMessageElementId(internalMessageId: string): string {
  return `moonchat-msg-${internalMessageId}`;
}

export function findMessageByExternalMessageId(
  messageList: ConversationMessage[],
  externalMessageId: string,
): ConversationMessage | undefined {
  return messageList.find((m) => m.externalMessageId === externalMessageId);
}

const replyPreviewAttachmentLabels: Record<string, string> = {
  image: "[图片]",
  audio: "[音频]",
  video: "[视频]",
  file: "[文件]",
};

export function getReplyReferenceTextPreview(message: ConversationMessage, maxLength = 160): string {
  if (message.isDeleted) {
    return "（消息已删除）";
  }
  const attachment = getMessageAttachment(message);
  const trimmed = message.contentText.trim();
  if (trimmed) {
    return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}…`;
  }
  if (attachment) {
    return replyPreviewAttachmentLabels[attachment.kind] ?? "[附件]";
  }
  return "（无文字内容）";
}

export function scrollChatMessageIntoView(internalMessageId: string): void {
  const el = document.getElementById(chatMessageElementId(internalMessageId));
  if (!el) {
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("chat-message-scroll-highlight");
  window.setTimeout(() => {
    el.classList.remove("chat-message-scroll-highlight");
  }, 1200);
}

export function inferAttachmentKind(mimeType: string | null): string {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("video/")) return "video";
  return "file";
}

export function inferMimeTypeFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "xls") return "application/vnd.ms-excel";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "csv") return "text/csv";
  if (extension === "txt") return "text/plain";
  return "application/octet-stream";
}

export function isSupportedChatAttachment(fileName: string, mimeType: string) {
  if (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("spreadsheetml")
  ) {
    return true;
  }

  const extension = fileName.split(".").pop()?.toLowerCase();
  return ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"].includes(extension ?? "");
}

export function getDataUrlMimeType(dataUrl: string) {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? null;
}

export function getConversationPreferredName(conversation: ConversationSummary) {
  const label = conversation.participantLabel?.trim();
  if (label && label !== conversation.externalUserId) {
    return label;
  }

  const title = conversation.title.trim();
  if (title && title !== conversation.externalUserId && !/^Telegram User\s+\d+$/i.test(title)) {
    return title;
  }

  return label || title || conversation.externalUserId;
}

export function labelSender(senderType: string) {
  if (senderType === "user") return "用户";
  if (senderType === "human_agent") return "人工";
  if (senderType === "ai_agent") return "AI";
  return senderType;
}

export function describeSource(sourceType: string) {
  if (sourceType === "telegram") return "TelegramBot";
  if (sourceType === "telegram_user") return "Telegram 私人账号";
  if (sourceType === "whatsapp_personal") return "WhatsApp 私人账号";
  if (sourceType === "moonchat_ai") return "MoonChat AI";
  if (sourceType === "moonchat_human") return "人工工作台";
  if (sourceType === "local_ai") return "AI 助手";
  return sourceType;
}

export function describeChannel(channelType: string) {
  if (channelType === "local_ai") return "本地 AI";
  if (channelType === "telegram") return "TelegramBot";
  if (channelType === "telegram_user") return "Telegram 私人账号";
  if (channelType === "whatsapp_personal") return "WhatsApp 私人账号";
  return channelType;
}

export function labelMemoryType(memoryType: string) {
  if (memoryType === "profile") return "用户画像";
  if (memoryType === "fact") return "关键事实";
  if (memoryType === "strategy") return "沟通策略";
  if (memoryType === "summary") return "会话摘要";
  if (memoryType === "base") return "基础记忆";
  if (memoryType === "style") return "风格记忆";
  if (memoryType === "knowledge") return "知识记忆";
  return memoryType;
}

export function labelKnowledgeStatus(status: KnowledgeDocumentSummary["status"]) {
  if (status === "indexed") return "已索引";
  if (status === "partial") return "部分索引";
  if (status === "failed") return "失败";
  return "等待中";
}

export function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(value: string) {
  return messageDateTimeFormatter.format(new Date(value));
}

export function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return (sameDay ? sameDayConversationTimeFormatter : olderConversationTimeFormatter).format(date);
}

export function groupMessagesByDay(messages: ConversationMessage[]) {
  const groups = new Map<string, ConversationMessage[]>();

  for (const message of messages) {
    const label = dayMessageGroupFormatter.format(new Date(message.createdAt));
    const items = groups.get(label);
    if (items) {
      items.push(message);
    } else {
      groups.set(label, [message]);
    }
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export function findMemoryContent(memories: MemoryEntry[], memoryType: string) {
  return memories.find((memory) => memory.memoryType === memoryType)?.content ?? "";
}

export function normalizeChannels(channels: ChannelConfig[]) {
  return channels.map((channel, index) => ({
    ...channel,
    name:
      channel.name.trim() ||
      (channel.type === "telegram_user"
        ? `Telegram 私人账号 ${index + 1}`
        : channel.type === "whatsapp_personal"
          ? `WhatsApp 私人账号 ${index + 1}`
          : `TelegramBot ${index + 1}`),
    botToken: channel.botToken?.trim() ?? "",
    apiId: channel.type === "telegram_user" ? undefined : channel.apiId,
    apiHash: channel.type === "telegram_user" ? "" : channel.apiHash?.trim() ?? "",
    phoneNumber: channel.phoneNumber?.trim() ?? "",
    loginCode: channel.loginCode?.trim() ?? "",
    twoFactorPassword: channel.twoFactorPassword?.trim() ?? "",
    sessionString: channel.sessionString?.trim() ?? "",
    authStatePath: channel.authStatePath?.trim() ?? "",
    lastQrDataUrl: channel.lastQrDataUrl ?? "",
  }));
}

export function createTelegramChannel(index: number): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    type: "telegram",
    name: `TelegramBot ${index}`,
    botToken: "",
    enabled: true,
  };
}

export function createTelegramUserChannel(index: number): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    type: "telegram_user",
    name: `Telegram 私人账号 ${index}`,
    apiId: undefined,
    apiHash: "",
    phoneNumber: "",
    loginCode: "",
    twoFactorPassword: "",
    sessionString: "",
    enabled: true,
  };
}

export function createWhatsappPersonalChannel(index: number): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    type: "whatsapp_personal",
    name: `WhatsApp 私人账号 ${index}`,
    authStatePath: "",
    lastQrDataUrl: "",
    enabled: true,
  };
}

export function getChannelRowStatus(
  channel: ChannelConfig,
  channelStatus: ChannelConnectionStatus | null,
) {
  if (!channel.enabled) {
    return { label: "已停用", description: "", tone: "muted" };
  }
  if (!channelStatus) {
    return { label: "检测中", description: "正在检查连接", tone: "checking" };
  }
  if (channelStatus.connected) {
    return {
      label: "已连接",
      description: channel.type === "whatsapp_personal" ? "会话有效" : "服务正常",
      tone: "ok",
    };
  }
  return {
    label: channelStatus.needsLogin ? "需重新登录" : "连接异常",
    description: channelStatus.message || `${describeChannel(channel.type)} 未连接`,
    tone: "warning",
  };
}

export function readStoredView(): AppView {
  const stored = window.localStorage.getItem(workspaceViewStorageKey);
  return stored === "chat" || stored === "channels" || stored === "ai" ? stored : "ai";
}

export function readStoredAiTab(): AiTab {
  const stored = window.localStorage.getItem(aiTabStorageKey);
  return stored === "assistant" ||
    stored === "base" ||
    stored === "style" ||
    stored === "knowledge" ||
    stored === "rag" ||
    stored === "model"
    ? stored
    : "assistant";
}

export function positionCanvasAfterRender(
  canvas: HTMLDivElement | null,
  anchor: HTMLDivElement | null = null,
  onPositioned?: () => void,
) {
  if (!canvas) {
    return;
  }

  window.requestAnimationFrame(() => {
    if (anchor) {
      canvas.scrollTop = Math.max(0, anchor.offsetTop - 12);
    } else {
      canvas.scrollTop = canvas.scrollHeight;
    }
    onPositioned?.();
  });
}

export function positionElementAfterRender(element: HTMLElement | null, onPositioned?: () => void) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element?.scrollIntoView({ block: "end" });
      onPositioned?.();
    });
  });
}

export function areMessageListsEqual(current: ConversationMessage[], next: ConversationMessage[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((message, index) => {
    const nextMessage = next[index];
    return (
      message.id === nextMessage.id &&
      message.contentText === nextMessage.contentText &&
      message.editedAt === nextMessage.editedAt &&
      message.isDeleted === nextMessage.isDeleted &&
      message.attachmentDataUrl === nextMessage.attachmentDataUrl &&
      message.attachmentImageDataUrl === nextMessage.attachmentImageDataUrl
    );
  });
}

export function areMemoryListsEqual(current: MemoryEntry[], next: MemoryEntry[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((memory, index) => {
    const nextMemory = next[index];
    return (
      memory.id === nextMemory.id &&
      memory.content === nextMemory.content &&
      memory.summary === nextMemory.summary &&
      memory.updatedAt === nextMemory.updatedAt
    );
  });
}

export function mergeMessageLists(
  olderMessages: ConversationMessage[],
  currentMessages: ConversationMessage[],
) {
  if (!olderMessages.length) {
    return currentMessages;
  }

  const byId = new Map<string, ConversationMessage>();
  for (const message of [...olderMessages, ...currentMessages]) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function findFirstUnreadInboundMessageId(
  conversationId: string | null,
  visibleMessages: ConversationMessage[],
) {
  if (!conversationId) {
    return null;
  }

  const readAt = window.localStorage.getItem(`${chatReadAtStoragePrefix}${conversationId}`);
  const readAtTime = readAt ? new Date(readAt).getTime() : 0;
  const firstUnread = visibleMessages.find(
    (message) =>
      message.messageRole === "inbound" &&
      !message.isDeleted &&
      new Date(message.createdAt).getTime() > readAtTime,
  );

  return firstUnread?.id ?? null;
}

export function writeConversationReadAt(conversationId: string, createdAt: string) {
  window.localStorage.setItem(`${chatReadAtStoragePrefix}${conversationId}`, createdAt);
}

export function formatUnreadCount(count: number) {
  return count > 999 ? "..." : String(count);
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}
