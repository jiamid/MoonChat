export interface ConversationSummary {
  id: string;
  title: string;
  channelType: string;
  externalUserId: string;
  externalChatId: string | null;
  participantLabel: string | null;
  autoReplyEnabled: boolean;
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
  telegram: {
    botToken: string;
  };
  ai: {
    provider: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
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
