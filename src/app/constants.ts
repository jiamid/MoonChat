import type { AppSettings } from "../shared/contracts";

export const workspaceViewStorageKey = "moonchat:last-view";
export const aiTabStorageKey = "moonchat:last-ai-tab";
export const chatReadAtStoragePrefix = "moonchat:chat-read-at:";
export const messagePageSize = 80;

export const messageDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const dayMessageGroupFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const sameDayConversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

export const olderConversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export const chatAttachmentAccept = [
  "image/*",
  "audio/*",
  "video/*",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  "text/plain",
].join(",");

export const defaultSettings: AppSettings = {
  ui: { themeMode: "dark" },
  telegram: { botToken: "" },
  channels: [],
  ai: {
    provider: "openai",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    temperature: 0.4,
    ragToolEnabled: true,
    systemPrompt:
      "你是 MoonChat 的 AI 助手，负责在聊天聚合工作台里协助进行自然、稳妥、贴近上下文的回复。",
    autoReplySystemPrompt:
      "你正在代表使用者本人回复外部聊天消息。你的目标是模拟使用者的口吻、偏好、知识边界和沟通风格，基于记忆与最近上下文给出自然回复。不要暴露你是 AI，不要提 MoonChat，不要虚构事实；不确定时用简短、保守、可继续追问的方式回复。",
  },
};
