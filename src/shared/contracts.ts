export interface ConversationSummary {
  id: string;
  title: string;
  channelType: string;
  channelId: string | null;
  externalUserId: string;
  externalChatId: string | null;
  participantLabel: string | null;
  autoReplyEnabled: boolean;
  learningStatus: "idle" | "running" | "learned";
  learnedAt: string | null;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  externalMessageId: string | null;
  senderType: string;
  senderId: string;
  sourceType: string;
  messageRole: string;
  contentText: string;
  contentType: string;
  attachmentImageDataUrl: string | null;
  attachmentMimeType: string | null;
  replyToMessageId: string | null;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
}

export interface LearningJobSummary {
  id: string;
  jobType: string;
  status: string;
  targetConversationId: string | null;
  updatedAt: string;
}

export interface AppDashboardSnapshot {
  counters: {
    conversations: number;
    messages: number;
    memories: number;
  };
  latestJobs: LearningJobSummary[];
}

export interface AppSettings {
  ui: {
    themeMode: "light" | "dark";
  };
  telegram: {
    botToken: string;
  };
  channels: ChannelConfig[];
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    systemPrompt: string;
    autoReplySystemPrompt: string;
  };
}

export interface ChannelConfig {
  id: string;
  type: "telegram" | "telegram_user" | "whatsapp_personal";
  name: string;
  botToken?: string;
  apiId?: number;
  apiHash?: string;
  phoneNumber?: string;
  loginCode?: string;
  twoFactorPassword?: string;
  sessionString?: string;
  authStatePath?: string;
  lastQrDataUrl?: string;
  enabled: boolean;
}

export interface MemoryEntry {
  id: string;
  memoryScope: string;
  memoryType: string;
  scopeRefId: string | null;
  content: string;
  summary: string | null;
  confidence: number;
  updatedAt: string;
}
