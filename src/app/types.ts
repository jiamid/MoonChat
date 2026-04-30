import type { ConversationMessage } from "../shared/contracts";

export type MessageRoleFilter = "all" | "inbound" | "outbound";
export type MessageSourceFilter =
  | "all"
  | "telegram"
  | "telegram_user"
  | "whatsapp_personal"
  | "moonchat_ai"
  | "moonchat_human";
export type AppView = "chat" | "channels" | "ai";
export type AiTab = "assistant" | "base" | "style" | "knowledge" | "rag" | "model";
export type ThemeMode = "light" | "dark";

export type AttachmentDraft = {
  dataUrl: string;
  mimeType: string;
  kind: string;
  fileName: string;
};

export type MessageCacheEntry = {
  messages: ConversationMessage[];
  hasMore: boolean;
};

export type ChannelConnectionStatus = {
  ok: boolean;
  connected: boolean;
  needsLogin: boolean;
  message: string;
  checkedAt: string;
};

export type RenderAttachment = {
  kind: string;
  dataUrl: string;
  mimeType: string | null;
  fileName: string | null;
};
