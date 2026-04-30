import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ForumIcon from "@mui/icons-material/Forum";
import HubIcon from "@mui/icons-material/Hub";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import MemoryIcon from "@mui/icons-material/Memory";
import StyleIcon from "@mui/icons-material/Style";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import TuneIcon from "@mui/icons-material/Tune";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PsychologyIcon from "@mui/icons-material/Psychology";
import logoSrc from "../logo.png";
import type {
  AppDashboardSnapshot,
  AppSettings,
  ChannelConfig,
  ConversationMessage,
  ConversationSummary,
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  MemoryEntry,
  RagProgressEvent,
} from "./shared/contracts";

type MessageRoleFilter = "all" | "inbound" | "outbound";
type MessageSourceFilter =
  | "all"
  | "telegram"
  | "telegram_user"
  | "whatsapp_personal"
  | "moonchat_ai"
  | "moonchat_human";
type AppView = "chat" | "channels" | "ai";
type AiTab = "assistant" | "base" | "style" | "knowledge" | "rag" | "model";
type ThemeMode = "light" | "dark";
type AttachmentDraft = {
  dataUrl: string;
  mimeType: string;
  kind: string;
  fileName: string;
};
type MessageCacheEntry = {
  messages: ConversationMessage[];
  hasMore: boolean;
};
type ChannelConnectionStatus = {
  ok: boolean;
  connected: boolean;
  needsLogin: boolean;
  message: string;
  checkedAt: string;
};

const workspaceViewStorageKey = "moonchat:last-view";
const aiTabStorageKey = "moonchat:last-ai-tab";
const chatReadAtStoragePrefix = "moonchat:chat-read-at:";
const messagePageSize = 80;
const messageDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dayMessageGroupFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const sameDayConversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});
const olderConversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});
const chatAttachmentAccept = [
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

const defaultSettings: AppSettings = {
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

export function App() {
  const isMac = navigator.userAgent.includes("Mac");
  const [view, setViewState] = useState<AppView>(() => readStoredView());
  const [aiTab, setAiTabState] = useState<AiTab>(() => readStoredAiTab());
  const [dashboard, setDashboard] = useState<AppDashboardSnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadedMessagesConversationId, setLoadedMessagesConversationId] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [globalAiMemories, setGlobalAiMemories] = useState<MemoryEntry[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocumentSummary[]>([]);
  const [knowledgeSearchDraft, setKnowledgeSearchDraft] = useState("");
  const [knowledgeSearchResults, setKnowledgeSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [knowledgeEmbeddingStatus, setKnowledgeEmbeddingStatus] = useState<{
    ok: boolean;
    provider: "builtin";
    model: string;
    message: string;
  } | null>(null);
  const [knowledgeProgress, setKnowledgeProgress] = useState<RagProgressEvent | null>(null);
  const [baseMemoryDraft, setBaseMemoryDraft] = useState("");
  const [styleMemoryDraft, setStyleMemoryDraft] = useState("");
  const [knowledgeMemoryDraft, setKnowledgeMemoryDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageRoleFilter, setMessageRoleFilter] = useState<MessageRoleFilter>("all");
  const [messageSourceFilter, setMessageSourceFilter] = useState<MessageSourceFilter>("all");
  const [draft, setDraft] = useState("");
  const [aiImageDraft, setAiImageDraft] = useState<AttachmentDraft | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [participantLabelDraft, setParticipantLabelDraft] = useState("");
  const [isAddChannelModalOpen, setIsAddChannelModalOpen] = useState(false);
  const [newChannelDraft, setNewChannelDraft] = useState<ChannelConfig>(() => createTelegramChannel(1));
  const [editingChannelDraft, setEditingChannelDraft] = useState<ChannelConfig | null>(null);
  const [isChatDetailDrawerOpen, setIsChatDetailDrawerOpen] = useState(false);
  const [learningConversationId, setLearningConversationId] = useState<string | null>(null);
  const [syncingHistoryConversationId, setSyncingHistoryConversationId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [whatsappQrPendingId, setWhatsappQrPendingId] = useState<string | null>(null);
  const [whatsappQrError, setWhatsappQrError] = useState<string | null>(null);
  const [whatsappConnectedById, setWhatsappConnectedById] = useState<Record<string, boolean>>({});
  const [channelStatusById, setChannelStatusById] = useState<Record<string, ChannelConnectionStatus>>({});
  const [unreadCountByConversationId, setUnreadCountByConversationId] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiImageInputRef = useRef<HTMLInputElement | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);
  const aiComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const aiMessageCanvasRef = useRef<HTMLDivElement | null>(null);
  const chatMessageCanvasRef = useRef<HTMLDivElement | null>(null);
  const chatUnreadAnchorRef = useRef<HTMLDivElement | null>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousAiMessageCountRef = useRef(0);
  const previousChatMessageCountRef = useRef(0);
  const previousAiConversationIdRef = useRef<string | null>(null);
  const previousChatConversationIdRef = useRef<string | null>(null);
  const [readyAiConversationId, setReadyAiConversationId] = useState<string | null>(null);
  const [readyChatConversationId, setReadyChatConversationId] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const liveRefreshRunningRef = useRef(false);
  const pendingConversationChangeRef = useRef<{ conversationId: string | null } | null>(null);
  const previousChannelStatusRef = useRef<Record<string, ChannelConnectionStatus>>({});
  const latestMessageRequestRef = useRef<string | null>(null);
  const previousLoadedSelectionRef = useRef<string | null>(null);
  const messageCacheRef = useRef(new Map<string, MessageCacheEntry>());
  const memoryCacheRef = useRef(new Map<string, MemoryEntry[]>());
  const isPrependingOlderMessagesRef = useRef(false);

  const setView = (nextView: AppView) => {
    setViewState(nextView);
    window.localStorage.setItem(workspaceViewStorageKey, nextView);
  };
  const setAiTab = (nextAiTab: AiTab) => {
    setAiTabState(nextAiTab);
    window.localStorage.setItem(aiTabStorageKey, nextAiTab);
  };

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const localAiConversation =
    conversations.find((conversation) => conversation.channelType === "local_ai") ?? null;
  const isAssistantView = view === "ai" && aiTab === "assistant";
  const activeConversation =
    view === "ai" && aiTab === "assistant" ? localAiConversation : selectedConversation;
  const hasAiHistory = view === "ai" && aiTab === "assistant" && messages.length > 0;
  const selectedConversationSupportsImages =
    isAssistantView ||
    selectedConversation?.channelType === "telegram" ||
    selectedConversation?.channelType === "telegram_user";
  const channelConversations = useMemo(
    () => conversations.filter((conversation) => conversation.channelType !== "local_ai"),
    [conversations],
  );
  const channelNameById = useMemo(
    () =>
      new Map(
        settings.channels.map((channel) => [
          channel.id,
          channel.name.trim() || describeChannel(channel.type),
        ] as const),
      ),
    [settings.channels],
  );
  const getConversationChannelName = (conversation: ConversationSummary) =>
    conversation.channelId
      ? channelNameById.get(conversation.channelId) ?? describeChannel(conversation.channelType)
      : describeChannel(conversation.channelType);
  const getConversationDisplayName = (conversation: ConversationSummary) =>
    getConversationPreferredName(conversation);
  const firstChannelConversationId = channelConversations[0]?.id ?? null;
  const themeMode = settings.ui.themeMode;

  useEffect(() => {
    document.body.dataset.theme = themeMode;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [themeMode]);

  const filteredConversations = useMemo(() => {
    const keyword = conversationSearch.trim().toLowerCase();
    return channelConversations.filter((conversation) => {
      if (!keyword) {
        return true;
      }

      return [
        conversation.title,
        conversation.participantLabel ?? "",
        conversation.externalUserId,
        conversation.channelType,
        getConversationChannelName(conversation),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [channelConversations, channelNameById, conversationSearch]);

  const filteredMessages = useMemo(() => {
    const keyword = messageSearch.trim().toLowerCase();
    return messages.filter((message) => {
      const roleMatched = messageRoleFilter === "all" || message.messageRole === messageRoleFilter;
      const sourceMatched =
        messageSourceFilter === "all" || message.sourceType === messageSourceFilter;
      const textMatched =
        !keyword ||
        [
          message.contentText,
          labelSender(message.senderType),
          describeSource(message.sourceType),
          message.messageRole,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return roleMatched && sourceMatched && textMatched;
    });
  }, [messageRoleFilter, messageSearch, messageSourceFilter, messages]);
  const learnedAtTimestamp =
    view === "chat" && selectedConversation?.learningStatus === "learned" && selectedConversation.learnedAt
      ? new Date(selectedConversation.learnedAt).getTime()
      : null;
  const chatUnreadMessageId = useMemo(
    () => findFirstUnreadInboundMessageId(selectedConversationId, filteredMessages),
    [filteredMessages, selectedConversationId],
  );
  const groupedChatMessages = useMemo(() => groupMessagesByDay(filteredMessages), [filteredMessages]);
  const groupedAssistantMessages = useMemo(() => groupMessagesByDay(messages), [messages]);

  async function refreshWorkspace() {
    const [snapshot, conversationList] = await Promise.all([
      window.moonchat.getDashboardSnapshot(),
      window.moonchat.listConversations(),
    ]);

    setDashboard(snapshot);
    setConversations(conversationList);
    void refreshUnreadCounts(conversationList);
    setSelectedConversationId((current) => {
      if (current && conversationList.some((item) => item.id === current)) {
        return current;
      }
      return conversationList.find((item) => item.channelType !== "local_ai")?.id ?? null;
    });

    return conversationList;
  }

  async function refreshUnreadCounts(conversationList = conversations) {
    const readStates = conversationList
      .filter((conversation) => conversation.channelType !== "local_ai")
      .map((conversation) => ({
        conversationId: conversation.id,
        readAt: window.localStorage.getItem(`${chatReadAtStoragePrefix}${conversation.id}`),
      }));

    if (!readStates.length) {
      setUnreadCountByConversationId({});
      return;
    }

    try {
      setUnreadCountByConversationId(await window.moonchat.countUnreadMessages(readStates));
    } catch (unreadError) {
      console.error("Failed to refresh unread counts", unreadError);
    }
  }

  async function refreshSettings() {
    const savedSettings = await window.moonchat.getSettings();
    setSettings(savedSettings);
    setSettingsDraft(savedSettings);
  }

  async function refreshGlobalAiMemories() {
    const items = await window.moonchat.getGlobalAiMemories();
    setGlobalAiMemories(items);
    setBaseMemoryDraft(findMemoryContent(items, "base"));
    setStyleMemoryDraft(findMemoryContent(items, "style"));
    setKnowledgeMemoryDraft(findMemoryContent(items, "knowledge"));
  }

  async function refreshKnowledgeBase() {
    const [documents, embeddingStatus, progress] = await Promise.all([
      window.moonchat.listKnowledgeDocuments(),
      window.moonchat.getKnowledgeEmbeddingStatus(),
      window.moonchat.getKnowledgeProgress(),
    ]);
    setKnowledgeDocuments(documents);
    setKnowledgeEmbeddingStatus(embeddingStatus);
    setKnowledgeProgress(progress);
  }

  async function refreshMessages(conversationId: string) {
    latestMessageRequestRef.current = conversationId;
    const page = await window.moonchat.getConversationMessagePage(conversationId, {
      limit: messagePageSize,
    });
    if (latestMessageRequestRef.current !== conversationId) {
      return;
    }
    const cachedPage = messageCacheRef.current.get(conversationId);
    const nextMessages =
      cachedPage && cachedPage.messages.length > page.messages.length
        ? mergeMessageLists(cachedPage.messages, page.messages)
        : page.messages;
    const nextHasMore =
      cachedPage && cachedPage.messages.length > page.messages.length
        ? cachedPage.hasMore
        : page.hasMore;
    messageCacheRef.current.set(conversationId, {
      messages: nextMessages,
      hasMore: nextHasMore,
    });
    setMessages((current) => (areMessageListsEqual(current, nextMessages) ? current : nextMessages));
    setHasOlderMessages(nextHasMore);
    setLoadedMessagesConversationId(conversationId);
  }

  async function loadOlderMessages() {
    if (!selectedConversationId || isLoadingOlderMessages || !hasOlderMessages || messages.length === 0) {
      return;
    }

    const conversationId = selectedConversationId;
    const canvas = chatMessageCanvasRef.current;
    const previousScrollHeight = canvas?.scrollHeight ?? 0;
    const beforeCreatedAt = messages[0].createdAt;

    setIsLoadingOlderMessages(true);
    try {
      const page = await window.moonchat.getConversationMessagePage(conversationId, {
        beforeCreatedAt,
        limit: messagePageSize,
      });
      if (selectedConversationId !== conversationId) {
        return;
      }

      const nextMessages = mergeMessageLists(page.messages, messages);
      messageCacheRef.current.set(conversationId, {
        messages: nextMessages,
        hasMore: page.hasMore,
      });
      isPrependingOlderMessagesRef.current = true;
      setMessages(nextMessages);
      setHasOlderMessages(page.hasMore);
      window.requestAnimationFrame(() => {
        if (canvas) {
          canvas.scrollTop += Math.max(0, canvas.scrollHeight - previousScrollHeight);
        }
        isPrependingOlderMessagesRef.current = false;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载更早消息失败。");
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }

  async function refreshMemories(conversation: ConversationSummary) {
    const nextMemories = await window.moonchat.listRelevantMemories({
      conversationId: conversation.id,
      userId: conversation.externalUserId,
    });
    memoryCacheRef.current.set(conversation.id, nextMemories);
    setMemories((current) => (areMemoryListsEqual(current, nextMemories) ? current : nextMemories));
  }

  async function refreshAll() {
    await Promise.all([
      refreshWorkspace(),
      refreshSettings(),
      refreshGlobalAiMemories(),
      refreshKnowledgeBase(),
    ]);
  }

  async function refreshChannelStatuses(options: { notifyOnDisconnect?: boolean } = {}) {
    const enabledChannels = settingsDraft.channels.filter((channel) => channel.enabled);
    if (enabledChannels.length === 0) {
      setChannelStatusById({});
      previousChannelStatusRef.current = {};
      return;
    }

    const entries = await Promise.all(
      enabledChannels.map(async (channel) => {
        try {
          const status = await window.moonchat.getChannelStatus(channel);
          return [channel.id, status] as const;
        } catch {
          return [
            channel.id,
            {
              ok: false,
              connected: false,
              needsLogin: channel.type !== "telegram",
              message: `${describeChannel(channel.type)} 服务未连接，请检查配置后重试。`,
              checkedAt: new Date().toISOString(),
            },
          ] as const;
        }
      }),
    );
    const nextStatusById = Object.fromEntries(entries);
    const previousStatusById = previousChannelStatusRef.current;
    setChannelStatusById(nextStatusById);
    setWhatsappConnectedById((current) => ({
      ...current,
      ...Object.fromEntries(
        entries
          .filter(([channelId]) => settingsDraft.channels.find((channel) => channel.id === channelId)?.type === "whatsapp_personal")
          .map(([channelId, status]) => [channelId, status.connected]),
      ),
    }));

    if (options.notifyOnDisconnect) {
      const disconnectedChannel = enabledChannels.find((channel) => {
        const previousStatus = previousStatusById[channel.id];
        const nextStatus = nextStatusById[channel.id];
        return previousStatus?.connected && nextStatus && !nextStatus.connected;
      });
      if (disconnectedChannel) {
        const status = nextStatusById[disconnectedChannel.id];
        setError(`${disconnectedChannel.name || describeChannel(disconnectedChannel.type)} 已掉线。${status?.message ?? "请检查配置后重试。"}`);
      }
    }

    previousChannelStatusRef.current = nextStatusById;
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const unsubscribe = window.moonchat.onKnowledgeProgress((payload) => {
      setKnowledgeProgress(payload);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const enabledChannels = settingsDraft.channels.filter((channel) => channel.enabled);
    if (enabledChannels.length === 0) {
      setChannelStatusById({});
      previousChannelStatusRef.current = {};
      return;
    }

    void refreshChannelStatuses();
    const intervalId = window.setInterval(() => {
      void refreshChannelStatuses({ notifyOnDisconnect: true });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [settingsDraft.channels]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setLoadedMessagesConversationId(null);
      setHasOlderMessages(false);
      setMemories([]);
      previousLoadedSelectionRef.current = null;
      return;
    }

    if (previousLoadedSelectionRef.current !== selectedConversationId) {
      const cachedPage = messageCacheRef.current.get(selectedConversationId);
      if (cachedPage) {
        setMessages(cachedPage.messages);
        setHasOlderMessages(cachedPage.hasMore);
        setLoadedMessagesConversationId(selectedConversationId);
      } else {
        setLoadedMessagesConversationId(null);
        setHasOlderMessages(false);
      }
      previousLoadedSelectionRef.current = selectedConversationId;
    }
    const conversation = selectedConversation?.id === selectedConversationId ? selectedConversation : null;
    const cachedMemories = memoryCacheRef.current.get(selectedConversationId);
    if (cachedMemories) {
      setMemories(cachedMemories);
    }
    void refreshMessages(selectedConversationId);
    if (conversation) {
      void refreshMemories(conversation);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (view === "ai" && aiTab === "assistant" && localAiConversation) {
      setSelectedConversationId((current) =>
        current === localAiConversation.id ? current : localAiConversation.id,
      );
    }
    if (view === "chat" && selectedConversation?.channelType === "local_ai") {
      setSelectedConversationId(firstChannelConversationId);
    }
  }, [aiTab, firstChannelConversationId, localAiConversation, selectedConversation?.channelType, view]);

  useEffect(() => {
    setParticipantLabelDraft(selectedConversation?.participantLabel ?? "");
  }, [selectedConversation?.id, selectedConversation?.participantLabel]);

  useLayoutEffect(() => {
    const activeConversationId = isAssistantView ? activeConversation?.id ?? null : null;
    const isConversationLoaded = loadedMessagesConversationId === activeConversationId;

    if (!isAssistantView) {
      setReadyAiConversationId(null);
      previousAiConversationIdRef.current = null;
      previousAiMessageCountRef.current = 0;
      return;
    }

    if (!isConversationLoaded) {
      return;
    }

    const hasNewAssistantMessage =
      messages.length > previousAiMessageCountRef.current ||
      activeConversationId !== previousAiConversationIdRef.current ||
      readyAiConversationId !== activeConversationId;

    if (hasNewAssistantMessage) {
      positionElementAfterRender(aiMessagesEndRef.current, () => {
        setReadyAiConversationId(activeConversationId);
      });
    }

    previousAiMessageCountRef.current = messages.length;
    previousAiConversationIdRef.current = activeConversationId;
  }, [
    activeConversation?.id,
    isAssistantView,
    loadedMessagesConversationId,
    messages,
    readyAiConversationId,
  ]);

  useLayoutEffect(() => {
    const activeConversationId = view === "chat" ? selectedConversationId : null;
    const isConversationLoaded = loadedMessagesConversationId === activeConversationId;

    if (view !== "chat" || !isConversationLoaded) {
      return;
    }

    const hasNewChatMessage =
      messages.length > previousChatMessageCountRef.current ||
      activeConversationId !== previousChatConversationIdRef.current ||
      readyChatConversationId !== activeConversationId;

    if (isPrependingOlderMessagesRef.current) {
      previousChatMessageCountRef.current = messages.length;
      previousChatConversationIdRef.current = activeConversationId;
      return;
    }

    if (hasNewChatMessage) {
      const latestMessageCreatedAt = messages.at(-1)?.createdAt ?? null;
      positionCanvasAfterRender(chatMessageCanvasRef.current, chatUnreadAnchorRef.current, () => {
        setReadyChatConversationId(activeConversationId);
        if (activeConversationId && latestMessageCreatedAt) {
          writeConversationReadAt(activeConversationId, latestMessageCreatedAt);
          setUnreadCountByConversationId((current) => ({
            ...current,
            [activeConversationId]: 0,
          }));
        }
      });
    }

    previousChatMessageCountRef.current = messages.length;
    previousChatConversationIdRef.current = activeConversationId;
  }, [
    loadedMessagesConversationId,
    chatUnreadMessageId,
    messages,
    readyChatConversationId,
    selectedConversationId,
    view,
  ]);

  useEffect(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    if (!error && !statusMessage) {
      return;
    }

    toastTimerRef.current = window.setTimeout(() => {
      setError(null);
      setStatusMessage(null);
      toastTimerRef.current = null;
    }, error ? 5200 : 2600);

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [error, statusMessage]);

  useEffect(() => {
    let disposed = false;

    const handleConversationChanged = async (payload: { conversationId: string | null }) => {
      if (disposed) {
        return;
      }

      if (view !== "chat" && !(view === "ai" && aiTab === "assistant")) {
        return;
      }

      if (liveRefreshRunningRef.current) {
        pendingConversationChangeRef.current = payload;
        return;
      }

      liveRefreshRunningRef.current = true;

      try {
        const shouldRefreshCurrentMessagesFirst =
          Boolean(payload.conversationId) && payload.conversationId === selectedConversationId;

        if (shouldRefreshCurrentMessagesFirst && payload.conversationId) {
          await refreshMessages(payload.conversationId);
        }

        const conversationList = await refreshWorkspace();
        if (disposed) {
          return;
        }

        const fallbackConversationId =
          conversationList.find((item) =>
            view === "chat" ? item.channelType !== "local_ai" : item.channelType === "local_ai",
          )?.id ?? null;
        const nextSelectedConversationId =
          selectedConversationId && conversationList.some((item) => item.id === selectedConversationId)
            ? selectedConversationId
            : fallbackConversationId;
        const nextConversation =
          conversationList.find((item) => item.id === nextSelectedConversationId) ?? null;

        if (nextSelectedConversationId && !shouldRefreshCurrentMessagesFirst) {
          await refreshMessages(nextSelectedConversationId);
        } else {
          if (!nextSelectedConversationId) {
            setMessages([]);
            setLoadedMessagesConversationId(null);
          }
        }

        if (nextConversation) {
          await refreshMemories(nextConversation);
        } else {
          setMemories([]);
        }
      } catch (pushRefreshError) {
        if (!disposed) {
          console.error("Failed to refresh pushed conversation change", pushRefreshError);
        }
      } finally {
        liveRefreshRunningRef.current = false;

        if (pendingConversationChangeRef.current) {
          const pendingPayload = pendingConversationChangeRef.current;
          pendingConversationChangeRef.current = null;
          void handleConversationChanged(pendingPayload);
        }
      }
    };

    const unsubscribe = window.moonchat.onConversationChanged((payload) => {
      void handleConversationChanged(payload);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [selectedConversationId, view, aiTab]);

  useEffect(() => {
    if (!selectedConversationId || (view !== "chat" && !isAssistantView)) {
      return;
    }

    const refreshVisibleConversation = () => {
      void Promise.all([refreshWorkspace(), refreshMessages(selectedConversationId)]);
    };
    const intervalId = window.setInterval(refreshVisibleConversation, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAssistantView, selectedConversationId, view]);

  async function handleSendMessage() {
    const targetConversationId = isAssistantView ? activeConversation?.id : selectedConversationId;
    const nextText = draft.trim();
    const canSendAttachmentOnly = Boolean(aiImageDraft);
    const optimisticAttachmentDraft = aiImageDraft;
    const isAiAssistantSend = isAssistantView && Boolean(activeConversation);

    if (!targetConversationId || (!nextText && !canSendAttachmentOnly)) {
      return;
    }
    if (isAssistantView && optimisticAttachmentDraft && optimisticAttachmentDraft.kind !== "image") {
      setError("AI 助手目前只支持发送图片附件。");
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);

    let optimisticMessageId: string | null = null;
    if (isAiAssistantSend && activeConversation) {
      optimisticMessageId = `temp-${crypto.randomUUID()}`;
      setMessages((current) => [
        ...current,
        {
          id: optimisticMessageId,
          conversationId: activeConversation.id,
          externalMessageId: null,
          senderType: "user",
          senderId: "local-human",
          sourceType: "local_ai",
          messageRole: "inbound",
          contentText: nextText,
          contentType: optimisticAttachmentDraft ? `text_${optimisticAttachmentDraft.kind}` : "text",
          attachmentImageDataUrl:
            optimisticAttachmentDraft?.kind === "image" ? optimisticAttachmentDraft.dataUrl : null,
          attachmentDataUrl: optimisticAttachmentDraft?.dataUrl ?? null,
          attachmentKind: optimisticAttachmentDraft?.kind ?? null,
          attachmentMimeType: optimisticAttachmentDraft?.mimeType ?? null,
          attachmentFileName: optimisticAttachmentDraft?.fileName ?? null,
          replyToMessageId: null,
          isDeleted: false,
          editedAt: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft("");
      setAiImageDraft(null);
      if (aiImageInputRef.current) {
        aiImageInputRef.current.value = "";
      }
      window.requestAnimationFrame(() => {
        positionElementAfterRender(aiMessagesEndRef.current);
        aiComposerTextareaRef.current?.focus();
      });
    }

    try {
      await window.moonchat.sendManualMessage(targetConversationId, nextText, {
        imageDataUrl: optimisticAttachmentDraft?.kind === "image" ? optimisticAttachmentDraft.dataUrl : undefined,
        imageMimeType: optimisticAttachmentDraft?.kind === "image" ? optimisticAttachmentDraft.mimeType : undefined,
        attachmentDataUrl: optimisticAttachmentDraft?.dataUrl,
        attachmentMimeType: optimisticAttachmentDraft?.mimeType,
        attachmentKind: optimisticAttachmentDraft?.kind,
        attachmentFileName: optimisticAttachmentDraft?.fileName,
      });
      if (!isAiAssistantSend) {
        setDraft("");
        setAiImageDraft(null);
        if (chatImageInputRef.current) {
          chatImageInputRef.current.value = "";
        }
      }
      await refreshWorkspace();
      await refreshMessages(targetConversationId);
      const targetConversation = conversations.find((item) => item.id === targetConversationId);
      if (targetConversation) {
        await refreshMemories(targetConversation);
      }
    } catch (sendError) {
      if (optimisticMessageId) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
        setDraft(nextText);
        setAiImageDraft(optimisticAttachmentDraft);
      }
      setError(sendError instanceof Error ? sendError.message : "发送消息失败。");
    } finally {
      setIsBusy(false);
      if (isAiAssistantSend) {
        window.requestAnimationFrame(() => {
          aiComposerTextareaRef.current?.focus();
        });
      }
    }
  }

  async function handleSaveEdit() {
    if (!editingMessageId || !editingDraft.trim() || !selectedConversationId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.updateMessage(editingMessageId, editingDraft.trim());
      setEditingMessageId(null);
      setEditingDraft("");
      await refreshWorkspace();
      await refreshMessages(selectedConversationId);
      if (selectedConversation) {
        await refreshMemories(selectedConversation);
      }
      setStatusMessage("消息已更新。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "编辑消息失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!selectedConversationId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.deleteMessage(messageId);
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditingDraft("");
      }
      await refreshWorkspace();
      await refreshMessages(selectedConversationId);
      if (selectedConversation) {
        await refreshMemories(selectedConversation);
      }
      setStatusMessage("消息已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除消息失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveModelSettings() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ui: settingsDraft.ui,
        telegram: settingsDraft.telegram,
        channels: settingsDraft.channels,
        ai: {
          provider: "openai",
          apiKey: settingsDraft.ai.apiKey.trim(),
          baseUrl: settingsDraft.ai.baseUrl.trim(),
          model: settingsDraft.ai.model.trim(),
          temperature: Number(settingsDraft.ai.temperature),
          ragToolEnabled: settingsDraft.ai.ragToolEnabled,
          systemPrompt: settingsDraft.ai.systemPrompt.trim(),
          autoReplySystemPrompt: settingsDraft.ai.autoReplySystemPrompt.trim(),
        },
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setStatusMessage("模型配置已保存并重载。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存模型配置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function persistChannelSettings(nextChannels: ChannelConfig[], successMessage: string) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ui: settingsDraft.ui,
        telegram: { botToken: "" },
        channels: normalizeChannels(nextChannels),
        ai: settingsDraft.ai,
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setStatusMessage(successMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存渠道配置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveAiMemory(
    memoryType: "base" | "style" | "knowledge",
    content: string,
    summary: string,
  ) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.updateGlobalAiMemory({ memoryType, content: content.trim(), summary });
      await refreshGlobalAiMemories();
      setStatusMessage("AI 记忆已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 AI 记忆失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportKnowledgeFiles() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const imported = await window.moonchat.importKnowledgeFiles();
      await refreshKnowledgeBase();
      await refreshWorkspace();
      if (imported.length) {
        const failedCount = imported.filter((item) => item.status === "failed").length;
        setStatusMessage(
          failedCount
            ? `已导入 ${imported.length} 个文档，其中 ${failedCount} 个未完成 embedding。`
            : `已导入 ${imported.length} 个知识文档。`,
        );
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入知识库失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteKnowledgeDocument(documentId: string) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.deleteKnowledgeDocument(documentId);
      await refreshKnowledgeBase();
      await refreshWorkspace();
      setStatusMessage("知识文档已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除知识文档失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRebuildKnowledgeDocument(documentId: string) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.rebuildKnowledgeDocument(documentId);
      await refreshKnowledgeBase();
      setStatusMessage("知识文档已重建索引。");
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : "重建知识索引失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenKnowledgeDocument(documentId: string) {
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.openKnowledgeDocument(documentId);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "打开知识文档失败。");
    }
  }

  async function handleSearchKnowledge() {
    const query = knowledgeSearchDraft.trim();
    if (!query) {
      setKnowledgeSearchResults([]);
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      setKnowledgeSearchResults(await window.moonchat.searchKnowledge(query, 8));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "搜索知识库失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefreshKnowledgeBase() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await refreshKnowledgeBase();
      setStatusMessage("知识库列表、索引进度和 embedding 状态已刷新。");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "刷新知识库状态失败。");
    } finally {
      setIsBusy(false);
    }
  }

  function handleKnowledgeSearchDraftChange(value: string) {
    setKnowledgeSearchDraft(value);
    if (!value.trim()) {
      setKnowledgeSearchResults([]);
    }
  }

  async function handleToggleRagTool(enabled: boolean) {
    setError(null);
    setStatusMessage(null);
    setSettingsDraft((current) => ({
      ...current,
      ai: { ...current.ai, ragToolEnabled: enabled },
    }));

    try {
      const saved = await window.moonchat.updateSettings({
        ...settings,
        ai: {
          ...settings.ai,
          ragToolEnabled: enabled,
        },
      });
      setSettings(saved);
      setSettingsDraft(saved);
    } catch (toggleError) {
      setSettingsDraft(settings);
      setError(toggleError instanceof Error ? toggleError.message : "切换知识库工具失败。");
    }
  }

  async function handleThemeModeChange(nextThemeMode: ThemeMode) {
    if (nextThemeMode === settings.ui.themeMode) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ...settings,
        ui: { themeMode: nextThemeMode },
      });
      setSettings(saved);
      setSettingsDraft(saved);
    } catch (themeError) {
      setError(themeError instanceof Error ? themeError.message : "切换主题失败。");
    }
  }

  async function handleSaveParticipantLabel() {
    if (!selectedConversation) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.updateParticipantLabel(
        selectedConversation.id,
        participantLabelDraft.trim(),
      );
      setStatusMessage("联系方式已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存联系方式失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleTriggerLearning() {
    if (!selectedConversation) {
      return;
    }

    if (selectedConversation.learningStatus === "learned") {
      setStatusMessage("这个会话已经学习过了。");
      return;
    }

    if (selectedConversation.learningStatus === "running" || learningConversationId === selectedConversation.id) {
      return;
    }

    setLearningConversationId(selectedConversation.id);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await window.moonchat.triggerLearning(selectedConversation.id);
      await refreshWorkspace();

      if (result.status === "already_learned") {
        setStatusMessage("这个会话已经学习过了。");
        return;
      }

      if (result.status === "running") {
        setStatusMessage("这个会话正在学习中。");
        return;
      }

      setStatusMessage("会话学习完成。");
      await refreshMemories(selectedConversation);
    } catch (learningError) {
      setError(learningError instanceof Error ? learningError.message : "学习会话失败。");
    } finally {
      setLearningConversationId(null);
    }
  }

  async function handleSyncTelegramUserRecentHistory() {
    if (!selectedConversation || selectedConversation.channelType !== "telegram_user") {
      return;
    }

    setSyncingHistoryConversationId(selectedConversation.id);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await window.moonchat.syncTelegramUserRecentHistory(selectedConversation.id);
      await refreshWorkspace();
      await refreshMessages(selectedConversation.id);
      await refreshMemories(selectedConversation);
      setStatusMessage(`已同步最近 ${result.syncedCount} 条 Telegram 历史消息。`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步 Telegram 历史消息失败。");
    } finally {
      setSyncingHistoryConversationId(null);
    }
  }

  async function handleClearAiChat() {
    if (!localAiConversation) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.clearConversationMessages(localAiConversation.id);
      setMessages([]);
      setEditingMessageId(null);
      setEditingDraft("");
      setDraft("");
      setAiImageDraft(null);
      if (aiImageInputRef.current) {
        aiImageInputRef.current.value = "";
      }
      await refreshWorkspace();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "清空聊天记录失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePickAiImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("目前只支持图片文件。");
      event.target.value = "";
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAiImageDraft({ dataUrl, mimeType: file.type, kind: "image", fileName: file.name });
    setStatusMessage(null);
    setError(null);
  }

  async function handlePickChatAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const mimeType = file.type || inferMimeTypeFromFileName(file.name);
    const kind = inferAttachmentKind(mimeType);
    if (!isSupportedChatAttachment(file.name, mimeType)) {
      setError("目前只支持图片、音频、视频、PDF、Word、Excel 和 TXT 文件。");
      event.target.value = "";
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAiImageDraft({ dataUrl, mimeType, kind, fileName: file.name });
    setStatusMessage(null);
    setError(null);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void handleSendMessage();
  }

  function openAddChannelModal() {
    setNewChannelDraft(createTelegramUserChannel(settingsDraft.channels.length + 1));
    setIsAddChannelModalOpen(true);
  }

  function closeAddChannelModal() {
    setIsAddChannelModalOpen(false);
  }

  function openEditChannelModal(channel: ChannelConfig) {
    setEditingChannelDraft({ ...channel });
  }

  function closeEditChannelModal() {
    setEditingChannelDraft(null);
  }

  async function addChannelFromModal() {
    if (!(await ensureWhatsappChannelConnected(newChannelDraft))) {
      return;
    }
    const nextChannels = [...settingsDraft.channels, newChannelDraft];
    await persistChannelSettings(nextChannels, "渠道已添加并启动监听。");
    setIsAddChannelModalOpen(false);
  }

  async function saveEditingChannel() {
    if (!editingChannelDraft) {
      return;
    }
    if (!(await ensureWhatsappChannelConnected(editingChannelDraft))) {
      return;
    }

    const nextChannels = settingsDraft.channels.map((channel) =>
      channel.id === editingChannelDraft.id ? editingChannelDraft : channel,
    );
    await persistChannelSettings(nextChannels, "渠道配置已更新并重启监听。");
    setEditingChannelDraft(null);
  }

  async function removeChannel(channelId: string) {
    const nextChannels = settingsDraft.channels.filter((channel) => channel.id !== channelId);
    setSettingsDraft((current) => ({
      ...current,
      channels: nextChannels,
    }));
    await persistChannelSettings(nextChannels, "渠道已删除。");
  }

  async function toggleChannelEnabled(channel: ChannelConfig) {
    const nextEnabled = !channel.enabled;
    const nextChannels = settingsDraft.channels.map((item) =>
      item.id === channel.id ? { ...item, enabled: nextEnabled } : item,
    );
    setSettingsDraft((current) => ({
      ...current,
      channels: nextChannels,
    }));
    await persistChannelSettings(nextChannels, nextEnabled ? "渠道已启用。" : "渠道已暂停。");
  }

  async function requestTelegramUserCode(channel: ChannelConfig, applySession: (sessionString: string) => void) {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await window.moonchat.requestTelegramUserCode(channel);
      if (result.alreadyAuthorized && result.sessionString) {
        applySession(result.sessionString);
        setStatusMessage("该 Telegram 私人账号已授权，保存渠道即可启动监听。");
        return;
      }

      setStatusMessage(
        result.isCodeViaApp
          ? "验证码已发送到你的 Telegram App，请填入验证码后保存渠道。"
          : "验证码已通过短信发送，请填入验证码后保存渠道。",
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "发送 Telegram 验证码失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function requestWhatsappQr(channel: ChannelConfig, applyQr: (authStatePath: string, qrDataUrl: string) => void) {
    setIsBusy(true);
    setWhatsappQrPendingId(channel.id);
    setWhatsappQrError(null);
    setWhatsappConnectedById((current) => ({ ...current, [channel.id]: false }));
    try {
      const result = await window.moonchat.requestWhatsappQr(channel);
      applyQr(result.authStatePath, result.qrDataUrl);
      setWhatsappConnectedById((current) => ({ ...current, [channel.id]: result.connected }));
      setChannelStatusById((current) => ({
        ...current,
        [channel.id]: {
          ok: true,
          connected: result.connected,
          needsLogin: !result.connected,
          message: result.connected ? "WhatsApp 已连接。" : "等待手机 WhatsApp 扫码登录。",
          checkedAt: new Date().toISOString(),
        },
      }));
      if (!result.qrDataUrl && !result.connected) {
        setWhatsappQrError("暂时没有生成二维码，请稍后再试。");
      }
      if (!result.qrDataUrl && result.connected) {
        setWhatsappQrError(null);
      }
      if (result.qrDataUrl && !result.connected) {
        void pollWhatsappConnection(channel.id);
      }
    } catch (requestError) {
      setWhatsappQrError(requestError instanceof Error ? requestError.message : "生成 WhatsApp 二维码失败。");
    } finally {
      setWhatsappQrPendingId(null);
      setIsBusy(false);
    }
  }

  async function pollWhatsappConnection(channelId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      try {
        const status = await window.moonchat.getWhatsappStatus(channelId);
        setChannelStatusById((current) => ({ ...current, [channelId]: status }));
        if (status.connected) {
          setWhatsappConnectedById((current) => ({ ...current, [channelId]: true }));
          setWhatsappQrError(null);
          return;
        }
      } catch {
        return;
      }
    }
  }

  async function ensureWhatsappChannelConnected(channel: ChannelConfig) {
    if (channel.type !== "whatsapp_personal" || !channel.enabled) {
      return true;
    }
    if (whatsappConnectedById[channel.id]) {
      return true;
    }

    setIsBusy(true);
    setWhatsappQrError(null);
    try {
      const status = await window.moonchat.getWhatsappStatus(channel.id);
      setChannelStatusById((current) => ({ ...current, [channel.id]: status }));
      setWhatsappConnectedById((current) => ({ ...current, [channel.id]: status.connected }));
      if (status.connected) {
        return true;
      }
      setWhatsappQrError("请先用手机 WhatsApp 扫码并完成登录，再保存渠道。");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="feishu-shell" data-theme={themeMode} data-platform={isMac ? "mac" : "other"}>
      {isMac ? <div className="window-drag-strip" aria-hidden="true" /> : null}

      {isAddChannelModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeAddChannelModal}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-channel-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pane-header">
              <div>
                <h2 id="add-channel-title">添加渠道</h2>
              </div>
            </div>
            <div className="settings-grid modal-grid">
              <label className="settings-field">
                <span>渠道名称</span>
                <input
                  value={newChannelDraft.name}
                  onChange={(event) =>
                    setNewChannelDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="settings-field">
                <span>渠道类型</span>
                <select
                  value={newChannelDraft.type}
                  onChange={(event) =>
                    setNewChannelDraft((current) =>
	                      event.target.value === "telegram_user"
	                        ? {
	                            ...createTelegramUserChannel(settingsDraft.channels.length + 1),
	                            id: current.id,
	                            name:
	                              current.name.trim() && current.name !== "TelegramBot"
	                                ? current.name
	                                : `Telegram 私人账号 ${settingsDraft.channels.length + 1}`,
	                          }
	                        : event.target.value === "whatsapp_personal"
	                          ? {
	                              ...createWhatsappPersonalChannel(settingsDraft.channels.length + 1),
	                              id: current.id,
	                              name:
	                                current.name.trim() &&
	                                current.name !== "TelegramBot" &&
	                                !current.name.startsWith("Telegram 私人账号")
	                                  ? current.name
	                                  : `WhatsApp 私人账号 ${settingsDraft.channels.length + 1}`,
	                            }
	                        : {
	                            ...createTelegramChannel(settingsDraft.channels.length + 1),
	                            id: current.id,
	                            name:
	                              current.name.trim() &&
	                              !current.name.startsWith("Telegram 私人账号") &&
	                              !current.name.startsWith("WhatsApp 私人账号")
	                                ? current.name
	                                : `TelegramBot ${settingsDraft.channels.length + 1}`,
	                          },
                    )
                  }
                >
	                  <option value="telegram">TelegramBot</option>
	                  <option value="telegram_user">Telegram 私人账号</option>
	                  <option value="whatsapp_personal">WhatsApp 私人账号</option>
	                </select>
	              </label>
              {newChannelDraft.type === "telegram" ? (
                <label className="settings-field settings-field-wide">
                  <span>Bot Token</span>
                  <input
                    type="password"
                    value={newChannelDraft.botToken ?? ""}
                    onChange={(event) =>
                      setNewChannelDraft((current) => ({ ...current, botToken: event.target.value }))
                    }
                  />
                </label>
              ) : newChannelDraft.type === "telegram_user" ? (
                <>
                  <div className="settings-field settings-field-wide helper-card">
                    <strong>Telegram 私人账号登录说明</strong>
                    <p>首次登录：填写手机号并点击发送验证码；收到验证码后填入验证码再保存。</p>
                    <p>登录成功后会保存 session，后续一般不需要再次输入验证码或 2FA 密码。</p>
                  </div>
                  <label className="settings-field settings-field-wide">
                    <span>手机号</span>
                    <input
                      value={newChannelDraft.phoneNumber ?? ""}
                      placeholder="+8613800000000"
                      onChange={(event) =>
                        setNewChannelDraft((current) => ({ ...current, phoneNumber: event.target.value }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>验证码</span>
                    <input
                      value={newChannelDraft.loginCode ?? ""}
                      onChange={(event) =>
                        setNewChannelDraft((current) => ({ ...current, loginCode: event.target.value }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>2FA 密码（如有）</span>
                    <input
                      type="password"
                      value={newChannelDraft.twoFactorPassword ?? ""}
                      onChange={(event) =>
                        setNewChannelDraft((current) => ({
                          ...current,
                          twoFactorPassword: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="settings-field settings-field-wide">
                    <button
                      className="ghost-button"
                      onClick={() =>
                        void requestTelegramUserCode(newChannelDraft, (sessionString) =>
                          setNewChannelDraft((current) => ({ ...current, sessionString })),
                        )
                      }
                      disabled={isBusy || !newChannelDraft.phoneNumber}
                    >
                      发送验证码
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="settings-field settings-field-wide helper-card">
                    <strong>WhatsApp 私人账号接入说明</strong>
                    <p>基于 WhatsApp Web 接入，可能会掉线或受 WhatsApp 风控影响。</p>
                  </div>
                  <div
                    className={
                      newChannelDraft.lastQrDataUrl
                        ? "settings-field settings-field-wide qr-preview-card"
                        : "settings-field settings-field-wide qr-action-card"
                    }
                    aria-busy={whatsappQrPendingId === newChannelDraft.id}
                  >
                    {newChannelDraft.lastQrDataUrl ? (
                      <>
                        <img src={newChannelDraft.lastQrDataUrl} alt="WhatsApp 登录二维码" />
                        <span>
                          {whatsappConnectedById[newChannelDraft.id]
                            ? "已扫码登录，可以保存渠道"
                            : "手机 WhatsApp → 已关联设备 → 扫码"}
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          className="ghost-button"
                          onClick={() =>
                            void requestWhatsappQr(newChannelDraft, (authStatePath, qrDataUrl) =>
                              setNewChannelDraft((current) => ({
                                ...current,
                                authStatePath,
                                lastQrDataUrl: qrDataUrl,
                              })),
                            )
                          }
                          disabled={isBusy}
                        >
                          {whatsappQrPendingId === newChannelDraft.id ? "生成中..." : "生成二维码"}
                        </button>
                        {whatsappQrPendingId === newChannelDraft.id ? (
                          <span className="qr-loading-text">正在向 WhatsApp 请求二维码</span>
                        ) : null}
                        {whatsappQrError ? <span className="qr-error-text">{whatsappQrError}</span> : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="settings-actions">
              <button className="ghost-button" onClick={closeAddChannelModal}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={() => void addChannelFromModal()}
                disabled={isBusy}
              >
                添加
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {editingChannelDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditChannelModal}>
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-channel-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pane-header">
              <div>
                <h2 id="edit-channel-title">编辑渠道</h2>
              </div>
            </div>
            <div className="settings-grid modal-grid">
              <label className="settings-field">
                <span>渠道名称</span>
                <input
                  value={editingChannelDraft.name}
                  onChange={(event) =>
                    setEditingChannelDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>渠道类型</span>
                <select value={editingChannelDraft.type} disabled>
                  <option value="telegram">TelegramBot</option>
                  <option value="telegram_user">Telegram 私人账号</option>
                  <option value="whatsapp_personal">WhatsApp 私人账号</option>
                </select>
              </label>
              {editingChannelDraft.type === "telegram" ? (
                <label className="settings-field settings-field-wide">
                  <span>Bot Token</span>
                  <input
                    type="password"
                    value={editingChannelDraft.botToken ?? ""}
                    onChange={(event) =>
                      setEditingChannelDraft((current) =>
                        current ? { ...current, botToken: event.target.value } : current,
                      )
                    }
                  />
                </label>
              ) : editingChannelDraft.type === "telegram_user" ? (
                <>
                  <div className="settings-field settings-field-wide helper-card">
                    <strong>Telegram 私人账号登录说明</strong>
                    <p>首次登录：填写手机号并点击发送验证码；收到验证码后填入验证码再保存。</p>
                    <p>登录成功后会保存 session，后续一般不需要再次输入验证码或 2FA 密码。</p>
                  </div>
                  <label className="settings-field settings-field-wide">
                    <span>手机号</span>
                    <input
                      value={editingChannelDraft.phoneNumber ?? ""}
                      placeholder="+8613800000000"
                      onChange={(event) =>
                        setEditingChannelDraft((current) =>
                          current ? { ...current, phoneNumber: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>验证码</span>
                    <input
                      value={editingChannelDraft.loginCode ?? ""}
                      onChange={(event) =>
                        setEditingChannelDraft((current) =>
                          current ? { ...current, loginCode: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>2FA 密码（如有）</span>
                    <input
                      type="password"
                      value={editingChannelDraft.twoFactorPassword ?? ""}
                      onChange={(event) =>
                        setEditingChannelDraft((current) =>
                          current ? { ...current, twoFactorPassword: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <div className="settings-field settings-field-wide">
                    <button
                      className="ghost-button"
                      onClick={() =>
                        void requestTelegramUserCode(editingChannelDraft, (sessionString) =>
                          setEditingChannelDraft((current) =>
                            current ? { ...current, sessionString } : current,
                          ),
                        )
                      }
                      disabled={
                        isBusy ||
                        !editingChannelDraft.phoneNumber
                      }
                    >
                      发送验证码
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="settings-field settings-field-wide helper-card">
                    <strong>WhatsApp 私人账号接入说明</strong>
                    <p>基于 WhatsApp Web 接入，可能会掉线或受 WhatsApp 风控影响。</p>
                  </div>
                  <div
                    className={
                      editingChannelDraft.lastQrDataUrl
                        ? "settings-field settings-field-wide qr-preview-card"
                        : "settings-field settings-field-wide qr-action-card"
                    }
                    aria-busy={whatsappQrPendingId === editingChannelDraft.id}
                  >
                    {editingChannelDraft.lastQrDataUrl ? (
                      <>
                        <img src={editingChannelDraft.lastQrDataUrl} alt="WhatsApp 登录二维码" />
                        <span>
                          {whatsappConnectedById[editingChannelDraft.id]
                            ? "已扫码登录，可以保存渠道"
                            : "手机 WhatsApp → 已关联设备 → 扫码"}
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          className="ghost-button"
                          onClick={() =>
                            void requestWhatsappQr(editingChannelDraft, (authStatePath, qrDataUrl) =>
                              setEditingChannelDraft((current) =>
                                current ? { ...current, authStatePath, lastQrDataUrl: qrDataUrl } : current,
                              ),
                            )
                          }
                          disabled={isBusy}
                        >
                          {whatsappQrPendingId === editingChannelDraft.id ? "生成中..." : "生成二维码"}
                        </button>
                        {whatsappQrPendingId === editingChannelDraft.id ? (
                          <span className="qr-loading-text">正在向 WhatsApp 请求二维码</span>
                        ) : null}
                        {whatsappQrError ? <span className="qr-error-text">{whatsappQrError}</span> : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="settings-actions">
              <button className="ghost-button" onClick={closeEditChannelModal}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={() => void saveEditingChannel()}
                disabled={isBusy}
              >
                保存
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="toast-layer" aria-live="polite" aria-atomic="true">
        {error ? (
          <div className="toast toast-error" role="alert">
            <div>
              <strong>操作失败</strong>
              <p>{error}</p>
            </div>
            <button className="toast-close" onClick={() => setError(null)} aria-label="关闭提示">
              ×
            </button>
          </div>
        ) : null}
        {!error && statusMessage ? (
          <div className="toast toast-success" role="status">
            <div>
              <strong>已完成</strong>
              <p>{statusMessage}</p>
            </div>
            <button
              className="toast-close"
              onClick={() => setStatusMessage(null)}
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

      <aside className="rail">
        <div className="rail-main">
          <div className="brand-mark">
            <img src={logoSrc} alt="MoonChat" className="brand-mark-image" />
          </div>
          <button
            className={view === "ai" ? "rail-button active" : "rail-button"}
            onClick={() => setView("ai")}
          >
            <span className="rail-button-icon" aria-hidden="true">
              <AutoAwesomeIcon fontSize="inherit" />
            </span>
            <span className="rail-button-label">AI</span>
          </button>
          <button
            className={view === "chat" ? "rail-button active" : "rail-button"}
            onClick={() => setView("chat")}
          >
            <span className="rail-button-icon" aria-hidden="true">
              <ForumIcon fontSize="inherit" />
            </span>
            <span className="rail-button-label">消息</span>
          </button>
          <button
            className={view === "channels" ? "rail-button active" : "rail-button"}
            onClick={() => setView("channels")}
          >
            <span className="rail-button-icon" aria-hidden="true">
              <HubIcon fontSize="inherit" />
            </span>
            <span className="rail-button-label">渠道</span>
          </button>
        </div>

        <div className="rail-footer">
          <div
            className="theme-switch"
            data-mode={themeMode}
            onClick={() => void handleThemeModeChange(themeMode === "dark" ? "light" : "dark")}
            role="button"
            tabIndex={0}
            aria-label={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
            aria-pressed={themeMode === "dark"}
            title={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                void handleThemeModeChange(themeMode === "dark" ? "light" : "dark");
              }
            }}
          >
            <span className="theme-switch-thumb" aria-hidden="true" />
            <span className="theme-switch-option theme-switch-option-light" aria-hidden="true">
              <LightModeIcon fontSize="inherit" />
            </span>
            <span className="theme-switch-option theme-switch-option-dark" aria-hidden="true">
              <DarkModeIcon fontSize="inherit" />
            </span>
          </div>
        </div>
      </aside>

      {view === "chat" ? (
        <>
          <section className="session-pane chat-session-pane">
            <header className="pane-header">
              <div>
                <h1>消息</h1>
              </div>
              <button
                className="ghost-button icon-only-button"
                onClick={() => void refreshWorkspace()}
                aria-label="刷新消息"
                title="刷新"
              >
                <RefreshIcon fontSize="small" />
              </button>
            </header>

            <div className="list-toolbar">
              <input
                className="search-input"
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="搜索渠道会话"
              />
            </div>

            <div className="session-list">
              {filteredConversations.length === 0 ? (
                <EmptyState
                  title={channelConversations.length === 0 ? "还没有渠道会话" : "没有匹配的会话"}
                  description="配置 TelegramBot 后，消息会自动进入这里。"
                />
              ) : (
                filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className={
                      conversation.id === selectedConversationId
                        ? "session-item active"
                        : "session-item"
                    }
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setEditingMessageId(null);
                      setEditingDraft("");
                    }}
                  >
                    <div className="session-card-top">
                      <div className="session-avatar" aria-hidden="true">
                        {getConversationDisplayName(conversation).slice(0, 1).toUpperCase()}
                        {unreadCountByConversationId[conversation.id] ? (
                          <span className="unread-badge">
                            {formatUnreadCount(unreadCountByConversationId[conversation.id])}
                          </span>
                        ) : null}
                      </div>
                      <div className="session-card-main">
                        <div className="session-title-row">
                          <strong>{getConversationDisplayName(conversation)}</strong>
                        </div>
                        <p>{conversation.externalUserId}</p>
                      </div>
                    </div>
                    <div className="session-meta-row session-meta-row-bottom">
                      <span className="meta-tag">{getConversationChannelName(conversation)}</span>
                      <span className="session-time">{formatConversationTime(conversation.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="conversation-pane chat-conversation-pane">
            <header className="conversation-topbar">
              <div className="conversation-heading">
                {selectedConversation ? (
                  <div className="conversation-avatar" aria-hidden="true">
                    {getConversationDisplayName(selectedConversation).slice(0, 1).toUpperCase()}
                  </div>
                ) : null}
                <div>
                <h2>{selectedConversation ? getConversationDisplayName(selectedConversation) : "选择一个会话"}</h2>
                <p>
                  {selectedConversation
                    ? `${getConversationChannelName(selectedConversation)} / ${
                        selectedConversation.participantLabel ?? selectedConversation.externalUserId
                      }`
                    : "在左侧选择一个会话开始处理消息"}
                </p>
                </div>
              </div>
              {selectedConversation ? (
                <div className="topbar-actions">
                  <button
                    className={
                      selectedConversation.autoReplyEnabled
                        ? "auto-reply-toggle-control active"
                        : "auto-reply-toggle-control"
                    }
                    onClick={async () => {
                      await window.moonchat.toggleAutoReply(
                        selectedConversation.id,
                        !selectedConversation.autoReplyEnabled,
                      );
                      await refreshWorkspace();
                    }}
                    aria-pressed={selectedConversation.autoReplyEnabled}
                  >
                    <SmartToyIcon fontSize="small" />
                    <span>自动回复</span>
                    <span className="pill-switch" aria-hidden="true">
                      <span />
                    </span>
                  </button>
                  <button
                    className="ghost-button icon-text-button"
                    onClick={() => void handleTriggerLearning()}
                    disabled={
                      selectedConversation.learningStatus === "learned" ||
                      selectedConversation.learningStatus === "running" ||
                      learningConversationId === selectedConversation.id
                    }
                  >
                    {selectedConversation.learningStatus === "running" ||
                    learningConversationId === selectedConversation.id ? (
                      <span className="button-inline-status">
                        <span className="inline-spinner" aria-hidden="true" />
                        学习中
                      </span>
                    ) : (
                      <>
                        <PsychologyIcon fontSize="small" />
                        学习
                      </>
                    )}
                  </button>
                  {selectedConversation.channelType === "telegram_user" ? (
                    <button
                      className="ghost-button icon-only-button"
                      onClick={() => void handleSyncTelegramUserRecentHistory()}
                      disabled={syncingHistoryConversationId === selectedConversation.id}
                      aria-label="同步最近消息"
                      title="同步最近消息"
                    >
                      {syncingHistoryConversationId === selectedConversation.id ? (
                        <span className="inline-spinner" aria-hidden="true" />
                      ) : (
                        <SyncIcon fontSize="small" />
                      )}
                    </button>
                  ) : null}
                  <button
                    className="ghost-button chat-detail-toggle"
                    onClick={() => setIsChatDetailDrawerOpen(true)}
                  >
                    会话详情
                  </button>
                </div>
              ) : null}
            </header>

            <section className="chat-thread-panel">
              {selectedConversation ? (
                <section className="message-toolbar chat-toolbar-card">
                  <input
                    className="search-input"
                    value={messageSearch}
                    onChange={(event) => setMessageSearch(event.target.value)}
                    placeholder="搜索消息内容"
                  />
                </section>
              ) : null}

              <div
                ref={chatMessageCanvasRef}
                className={
                  readyChatConversationId === selectedConversationId &&
                  loadedMessagesConversationId === selectedConversationId
                    ? "message-canvas chat-message-canvas"
                    : "message-canvas chat-message-canvas message-canvas-positioning"
                }
              >
                {!selectedConversation ? (
                  <EmptyState title="还没有打开会话" description="选择左侧会话后，在这里查看与回复消息。" />
                ) : filteredMessages.length === 0 ? (
                  <EmptyState title="没有匹配的消息" description="可以清空筛选条件，或等待新消息进来。" />
                ) : (
                  <>
                    {hasOlderMessages ? (
                      <button
                        className="load-older-messages-button"
                        onClick={() => void loadOlderMessages()}
                        disabled={isLoadingOlderMessages}
                      >
                        {isLoadingOlderMessages ? "加载中" : "加载更早消息"}
                      </button>
                    ) : null}
                    {selectedConversation.learningStatus === "running" ? (
                      <div className="thread-status-banner">
                        <span className="inline-spinner" aria-hidden="true" />
                        该会话正在学习中
                      </div>
                    ) : null}
                    {groupedChatMessages.map((group) => (
                      <div key={group.label} className="message-group">
                        <div className="message-group-label">{group.label}</div>
                        {group.items.map((message) => (
                          <div key={message.id} className="message-item-frame">
                            {message.id === chatUnreadMessageId ? (
                              <div ref={chatUnreadAnchorRef} className="unread-message-anchor">
                                新消息
                              </div>
                            ) : null}
                            {renderMessageBubble({
                              message,
                              editingDraft,
                              editingMessageId,
                              showLearnedBadge:
                                learnedAtTimestamp !== null &&
                                new Date(message.createdAt).getTime() <= learnedAtTimestamp,
                              onCancelEdit: () => {
                                setEditingMessageId(null);
                                setEditingDraft("");
                              },
                              onChangeEdit: setEditingDraft,
                              onDelete: handleDeleteMessage,
                              onEdit: (id, text) => {
                                setEditingMessageId(id);
                                setEditingDraft(text);
                              },
                              onSaveEdit: handleSaveEdit,
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              <footer className="composer chat-composer">
                {aiImageDraft ? (
                  <div className="attachment-preview-card">
                    <MessageAttachmentPreview
                      attachment={{
                        kind: aiImageDraft.kind,
                        dataUrl: aiImageDraft.dataUrl,
                        mimeType: aiImageDraft.mimeType,
                        fileName: aiImageDraft.fileName,
                      }}
                    />
                    <div className="attachment-preview-meta">
                      <strong>{aiImageDraft.fileName || "待发送附件"}</strong>
                      <button
                        className="text-button danger"
                        onClick={() => {
                          setAiImageDraft(null);
                          if (chatImageInputRef.current) {
                            chatImageInputRef.current.value = "";
                          }
                        }}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ) : null}
                <textarea
                  rows={4}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={selectedConversation ? "输入人工回复内容" : "先选择会话"}
                  disabled={!selectedConversation || isBusy}
                />
                <div className="composer-actions">
                  <div className="assistant-composer-tools">
                    <input
                      ref={chatImageInputRef}
                      className="hidden-file-input"
                      type="file"
                      accept={chatAttachmentAccept}
                      onChange={(event) => void handlePickChatAttachment(event)}
                    />
                    <button
                      className="ghost-button"
                      onClick={() => chatImageInputRef.current?.click()}
                      disabled={isBusy || !selectedConversation || !selectedConversationSupportsImages}
                    >
                      添加附件
                    </button>
                    <span>Telegram 会话支持图片、音视频和常见文档。</span>
                  </div>
                  <button
                    className="primary-button icon-only-button assistant-send-button"
                    onClick={() => void handleSendMessage()}
                    disabled={
                      !selectedConversation ||
                      (!draft.trim() && !aiImageDraft) ||
                      (Boolean(aiImageDraft) && !selectedConversationSupportsImages) ||
                      isBusy
                    }
                    aria-label="发送"
                    title="发送"
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </button>
                </div>
              </footer>
            </section>
          </section>

          {isChatDetailDrawerOpen ? (
            <div
              className="detail-drawer-backdrop"
              role="presentation"
              onMouseDown={() => setIsChatDetailDrawerOpen(false)}
            >
              <aside
                className="detail-pane chat-detail-pane detail-drawer"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="detail-drawer-header">
                  <h3>会话详情</h3>
                  <button className="ghost-button" onClick={() => setIsChatDetailDrawerOpen(false)}>
                    关闭
                  </button>
                </div>
                <ChatDetailContent
                  selectedConversation={selectedConversation}
                  memories={memories}
                  participantLabelDraft={participantLabelDraft}
                  isBusy={isBusy}
                  channelName={
                    selectedConversation ? getConversationChannelName(selectedConversation) : null
                  }
                  onParticipantLabelChange={setParticipantLabelDraft}
                  onSaveParticipantLabel={handleSaveParticipantLabel}
                />
              </aside>
            </div>
          ) : null}

          <aside className="detail-pane chat-detail-pane">
            <ChatDetailContent
              selectedConversation={selectedConversation}
              memories={memories}
              participantLabelDraft={participantLabelDraft}
              isBusy={isBusy}
              channelName={selectedConversation ? getConversationChannelName(selectedConversation) : null}
              onParticipantLabelChange={setParticipantLabelDraft}
              onSaveParticipantLabel={handleSaveParticipantLabel}
            />
          </aside>
        </>
      ) : view === "ai" ? (
        <section className="ai-layout">
          <aside className="ai-nav">
            <header className="pane-header">
              <div>
                <h1>AI</h1>
                <p>管理对话、记忆与模型</p>
              </div>
            </header>
            <div className="ai-tab-list">
              <button className={aiTab === "assistant" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("assistant")}>
                <SmartToyIcon fontSize="small" />
                <span>AI助手</span>
              </button>
              <button className={aiTab === "base" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("base")}>
                <MemoryIcon fontSize="small" />
                <span>基础记忆</span>
              </button>
              <button className={aiTab === "style" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("style")}>
                <StyleIcon fontSize="small" />
                <span>风格记忆</span>
              </button>
              <button className={aiTab === "knowledge" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("knowledge")}>
                <MenuBookIcon fontSize="small" />
                <span>知识记忆</span>
              </button>
              <button className={aiTab === "rag" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("rag")}>
                <LibraryBooksIcon fontSize="small" />
                <span>知识库</span>
              </button>
              <button className={aiTab === "model" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("model")}>
                <TuneIcon fontSize="small" />
                <span>模型</span>
              </button>
            </div>
          </aside>

          <section
            className={
              aiTab === "assistant"
                ? "ai-main ai-main-assistant"
                : aiTab === "base" || aiTab === "style" || aiTab === "knowledge"
                  ? "ai-main ai-main-memory"
                  : "ai-main"
            }
          >
            {aiTab === "assistant" ? (
              <section
                className={
                  hasAiHistory
                    ? "assistant-chat-shell assistant-chat-shell-history"
                    : "assistant-chat-shell assistant-chat-shell-empty"
                }
              >
                {hasAiHistory ? (
                  <>
                    <div className="assistant-chat-header">
                      <div>
                        <h2>MoonChat AI</h2>
                        <p>直接对话、调策略、改记忆。你也可以发图片让 AI 一起理解。</p>
                      </div>
                      <button
                        className="ghost-button icon-only-button subtle-danger"
                        onClick={() => void handleClearAiChat()}
                        disabled={!activeConversation || messages.length === 0 || isBusy}
                        aria-label="清空聊天"
                        title="清空聊天"
                      >
                        <DeleteIcon fontSize="small" />
                      </button>
                    </div>
                    <div
                      ref={aiMessageCanvasRef}
                      className={
                        readyAiConversationId === activeConversation?.id &&
                        loadedMessagesConversationId === activeConversation?.id
                          ? "message-canvas assistant-message-canvas"
                          : "message-canvas assistant-message-canvas message-canvas-positioning"
                      }
                    >
                      {!activeConversation ? (
                        <EmptyState title="AI 助手暂不可用" description="请刷新页面后再试。" />
                      ) : (
                        groupedAssistantMessages.map((group) => (
                          <div key={group.label} className="message-group">
                            <div className="message-group-label">{group.label}</div>
                            {group.items.map((message) =>
                              renderMessageBubble({
                                message,
                                layout: "assistant",
                                editingDraft,
                                editingMessageId,
                                onCancelEdit: () => {
                                  setEditingMessageId(null);
                                  setEditingDraft("");
                                },
                                onChangeEdit: setEditingDraft,
                                onDelete: handleDeleteMessage,
                                onEdit: (id, text) => {
                                  setEditingMessageId(id);
                                  setEditingDraft(text);
                                },
                                onSaveEdit: handleSaveEdit,
                              }),
                            )}
                          </div>
                        ))
                      )}
                      <div ref={aiMessagesEndRef} />
                    </div>
                  </>
                ) : (
                  <div className="assistant-empty-stage">
                    <div className="assistant-empty-copy">
                      <h2>有什么需要帮助的？</h2>
                      <p>直接向 AI 提需求，也可以发一张图片辅助说明。</p>
                    </div>
                  </div>
                )}
                <footer
                  className={
                    hasAiHistory
                      ? "assistant-composer assistant-composer-history"
                      : "assistant-composer assistant-composer-empty"
                  }
                >
                  {aiImageDraft ? (
                    <div className="attachment-preview-card">
                      <MessageAttachmentPreview
                        attachment={{
                          kind: aiImageDraft.kind,
                          dataUrl: aiImageDraft.dataUrl,
                          mimeType: aiImageDraft.mimeType,
                          fileName: aiImageDraft.fileName,
                        }}
                      />
                      <div className="attachment-preview-meta">
                        <strong>{aiImageDraft.fileName || "待发送图片"}</strong>
                        <button
                          className="text-button danger"
                          onClick={() => {
                            setAiImageDraft(null);
                            if (aiImageInputRef.current) {
                              aiImageInputRef.current.value = "";
                            }
                          }}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    ref={aiComposerTextareaRef}
                    rows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="给 AI 发送消息"
                    disabled={!activeConversation}
                  />
                  <div className="assistant-composer-actions">
                    <div className="assistant-composer-tools">
                      <input
                        ref={aiImageInputRef}
                        className="hidden-file-input"
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handlePickAiImage(event)}
                      />
                      <button
                        className="ghost-button"
                        onClick={() => aiImageInputRef.current?.click()}
                        disabled={isBusy}
                      >
                        添加图片
                      </button>
                      <span>
                        {hasAiHistory
                          ? "对话仅保存在本地，用于管理 AI。"
                          : "本地对话，不会同步到外部聊天渠道。"}
                      </span>
                    </div>
                    <button
                      className="primary-button icon-only-button assistant-send-button"
                      onClick={() => void handleSendMessage()}
                      disabled={
                        !activeConversation || (!draft.trim() && !aiImageDraft) || isBusy
                      }
                      aria-label="发送"
                      title="发送"
                    >
                      <ArrowUpwardIcon fontSize="small" />
                    </button>
                  </div>
                </footer>
              </section>
            ) : aiTab === "base" ? (
              <>
              <MemoryEditor
                title="基础记忆"
                description="定义使用者的身份、边界、原则和长期行为约束，供 AI 助手与自动回复共用。"
                value={baseMemoryDraft}
                onChange={setBaseMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("base", baseMemoryDraft, "Global base memory")
                }
              />
              </>
            ) : aiTab === "style" ? (
              <>
              <MemoryEditor
                title="风格记忆"
                description="定义使用者的说话方式、长度偏好、情绪风格、常用表达，供 AI 助手与自动回复共用。"
                value={styleMemoryDraft}
                onChange={setStyleMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("style", styleMemoryDraft, "Global style memory")
                }
              />
              </>
            ) : aiTab === "knowledge" ? (
              <>
              <MemoryEditor
                title="知识记忆"
                description="沉淀使用者可复用的产品信息、FAQ、规则、业务知识和常见判断依据。"
                value={knowledgeMemoryDraft}
                onChange={setKnowledgeMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("knowledge", knowledgeMemoryDraft, "Global knowledge memory")
                }
              />
              </>
            ) : aiTab === "rag" ? (
              <KnowledgeBasePanel
                documents={knowledgeDocuments}
                embeddingStatus={knowledgeEmbeddingStatus}
                ragToolEnabled={settingsDraft.ai.ragToolEnabled}
                progress={knowledgeProgress}
                searchDraft={knowledgeSearchDraft}
                searchResults={knowledgeSearchResults}
                isBusy={isBusy}
                onImport={() => void handleImportKnowledgeFiles()}
                onRefresh={() => void handleRefreshKnowledgeBase()}
                onToggleRagTool={(enabled) => void handleToggleRagTool(enabled)}
                onDelete={(documentId) => void handleDeleteKnowledgeDocument(documentId)}
                onRebuild={(documentId) => void handleRebuildKnowledgeDocument(documentId)}
                onOpen={(documentId) => void handleOpenKnowledgeDocument(documentId)}
                onSearchDraftChange={handleKnowledgeSearchDraftChange}
                onSearch={() => void handleSearchKnowledge()}
              />
            ) : (
              <>
                <article className="settings-panel model-settings-panel">
                <div className="pane-header">
                  <div>
                    <h1>模型</h1>
                    <p>配置模型、Base URL、API Key，以及两套职责不同的系统提示词。</p>
                  </div>
                </div>
                <div className="settings-grid">
                  <label className="settings-field">
                    <span>模型名</span>
                    <input
                      value={settingsDraft.ai.model}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, model: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field settings-field-wide">
                    <span>Base URL</span>
                    <input
                      value={settingsDraft.ai.baseUrl}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, baseUrl: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field settings-field-wide">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={settingsDraft.ai.apiKey}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, apiKey: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field">
                    <span>Temperature</span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={settingsDraft.ai.temperature}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, temperature: Number(event.target.value) },
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field settings-field-wide">
                    <span>AI 助手系统提示词</span>
                    <textarea
                      rows={6}
                      value={settingsDraft.ai.systemPrompt}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, systemPrompt: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="settings-field settings-field-wide">
                    <span>自动回复系统提示词</span>
                    <textarea
                      rows={6}
                      value={settingsDraft.ai.autoReplySystemPrompt}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, autoReplySystemPrompt: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="settings-actions">
                  <button className="primary-button" onClick={() => void handleSaveModelSettings()}>
                    保存模型配置
                  </button>
                </div>
                </article>
              </>
            )}
          </section>
        </section>
      ) : (
        <section className="settings-layout channels-layout">
          <article className="settings-panel channels-panel">
            <div className="pane-header">
              <div>
                <h1>渠道</h1>
                <p>管理外部消息接入</p>
              </div>
              <button className="ghost-button icon-text-button" onClick={openAddChannelModal}>
                <AddIcon fontSize="small" />
                添加渠道
              </button>
            </div>

            {settingsDraft.channels.length === 0 ? (
              <EmptyState title="暂无渠道" description="添加 TelegramBot 后，消息会在左侧消息列表中出现。" />
            ) : (
              <div className="channel-stack">
                {settingsDraft.channels.map((channel) => {
                  const channelStatus = channelStatusById[channel.id] ?? null;
                  const rowStatus = getChannelRowStatus(channel, channelStatus);
                  return (
                    <div className="channel-row" key={channel.id}>
                      <div className="channel-row-name">
                        <strong>{channel.name.trim() || "TelegramBot"}</strong>
                      </div>
                      <div className="channel-row-type">{describeChannel(channel.type)}</div>
                      <div className="channel-row-status" data-status={rowStatus.tone}>
                        <span>{rowStatus.label}</span>
                        {rowStatus.description ? <small>{rowStatus.description}</small> : null}
                      </div>
                      <button
                        className={channel.enabled ? "channel-enable-pill active" : "channel-enable-pill"}
                        onClick={() => void toggleChannelEnabled(channel)}
                        disabled={isBusy}
                        aria-pressed={channel.enabled}
                      >
                        {channel.enabled ? "启用中" : "已暂停"}
                      </button>
                      <button
                        className="ghost-button icon-text-button"
                        onClick={() => openEditChannelModal(channel)}
                      >
                        <EditIcon fontSize="small" />
                        编辑
                      </button>
                      <button
                        className="ghost-button icon-only-button subtle-danger"
                        onClick={() => void removeChannel(channel.id)}
                        aria-label="删除渠道"
                        title="删除渠道"
                      >
                        <DeleteIcon fontSize="small" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

          </article>
        </section>
      )}
    </main>
  );
}

function MemoryEditor({
  title,
  description,
  value,
  onChange,
  onSave,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <article className="settings-panel memory-editor-panel">
      <div className="pane-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-grid memory-editor-grid">
        <label className="settings-field settings-field-wide memory-editor-field">
          <span>{title}内容</span>
          <textarea
            className="memory-editor-textarea"
            rows={14}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
      <div className="settings-actions">
        <button className="primary-button" onClick={onSave}>
          保存{title}
        </button>
      </div>
    </article>
  );
}

function KnowledgeBasePanel({
  documents,
  embeddingStatus,
  ragToolEnabled,
  progress,
  searchDraft,
  searchResults,
  isBusy,
  onImport,
  onRefresh,
  onToggleRagTool,
  onDelete,
  onRebuild,
  onOpen,
  onSearchDraftChange,
  onSearch,
}: {
  documents: KnowledgeDocumentSummary[];
  embeddingStatus: {
    ok: boolean;
    provider: "builtin";
    model: string;
    message: string;
  } | null;
  ragToolEnabled: boolean;
  progress: RagProgressEvent | null;
  searchDraft: string;
  searchResults: KnowledgeSearchResult[];
  isBusy: boolean;
  onImport: () => void;
  onRefresh: () => void;
  onToggleRagTool: (enabled: boolean) => void;
  onDelete: (documentId: string) => void;
  onRebuild: (documentId: string) => void;
  onOpen: (documentId: string) => void;
  onSearchDraftChange: (value: string) => void;
  onSearch: () => void;
}) {
  const progressPercent = progress?.percent ?? null;
  const progressTone = progress?.phase === "error" ? "error" : progress?.phase === "completed" ? "ok" : "active";
  return (
    <article className="settings-panel knowledge-panel">
      <div className="pane-header">
        <div>
          <h1>知识库</h1>
          <p>独立于 AI 记忆的 RAG 文档库，当前支持 txt / md 文本导入。</p>
        </div>
        <div className="header-actions">
          <button
            className="rag-tool-switch"
            data-mode={ragToolEnabled ? "enabled" : "disabled"}
            onClick={() => onToggleRagTool(!ragToolEnabled)}
            disabled={isBusy}
            aria-label={ragToolEnabled ? "关闭 AI 调用知识库工具" : "开启 AI 调用知识库工具"}
            aria-pressed={ragToolEnabled}
            title={ragToolEnabled ? "AI 可按需调用知识库" : "AI 不会看到知识库工具"}
          >
            <span className="rag-tool-switch-thumb" aria-hidden="true" />
            <span className="rag-tool-switch-option rag-tool-switch-option-off" aria-hidden="true">
              关
            </span>
            <span className="rag-tool-switch-option rag-tool-switch-option-on" aria-hidden="true">
              开
            </span>
          </button>
          <button
            className="ghost-button icon-only-button"
            onClick={onRefresh}
            disabled={isBusy}
            aria-label="刷新知识库状态"
            title="刷新知识库列表、索引进度和 embedding 状态"
          >
            <RefreshIcon fontSize="small" />
          </button>
          <button className="primary-button icon-text-button" onClick={onImport} disabled={isBusy}>
            <AddIcon fontSize="small" />
            导入文档
          </button>
        </div>
      </div>

      <div className={embeddingStatus?.ok ? "rag-status-card ok" : "rag-status-card warning"}>
        <strong>{embeddingStatus?.model ?? "Xenova/multilingual-e5-small"}</strong>
        <span>{embeddingStatus?.message ?? "正在读取内置 embedding 状态。"}</span>
      </div>

      <div className={`rag-progress-card ${progressTone}`}>
        <div className="rag-progress-top">
          <strong>{progress?.message ?? "暂无索引任务"}</strong>
          {progressPercent !== null ? <span>{Math.round(progressPercent)}%</span> : null}
        </div>
        {progressPercent !== null ? (
          <div className="rag-progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
          </div>
        ) : null}
        <div className="rag-progress-meta">
          {progress?.documentTitle ? <span>{progress.documentTitle}</span> : null}
          {progress?.chunkIndex && progress.totalChunks ? (
            <span>
              {progress.chunkIndex}/{progress.totalChunks} chunks
            </span>
          ) : null}
          {progress?.file ? <span>{progress.file}</span> : null}
          {progress?.loaded && progress.total ? (
            <span>
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </span>
          ) : null}
        </div>
        {progress?.error ? <p className="rag-progress-error">{progress.error}</p> : null}
      </div>

      <section className="rag-search-panel">
        <div className="list-toolbar">
          <input
            className="search-input"
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="测试知识库检索"
          />
          <button className="ghost-button" onClick={onSearch} disabled={isBusy || !searchDraft.trim()}>
            搜索
          </button>
        </div>
        {searchResults.length ? (
          <div className="rag-result-stack">
            {searchResults.map((result) => (
              <div key={result.chunkId} className="rag-result-card">
                <div className="memory-card-top">
                  <strong>{result.documentTitle}</strong>
                  <span>{result.matchType} {result.score.toFixed(2)}</span>
                </div>
                <p>{result.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {documents.length ? (
        <div className="knowledge-document-stack">
          {documents.map((document) => (
            <div className="knowledge-document-row" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <p>{document.sourcePath ?? "手动文档"}</p>
                {document.lastError ? <small>{document.lastError}</small> : null}
              </div>
              <span className={`knowledge-status ${document.status}`}>
                {labelKnowledgeStatus(document.status)}
              </span>
              <span>{document.chunkCount} chunks</span>
              <button
                className="ghost-button icon-only-button"
                onClick={() => onOpen(document.id)}
                disabled={isBusy || !document.sourcePath}
                aria-label="打开知识文档"
                title={document.sourcePath ? "打开原文档" : "没有可打开的本地文件"}
              >
                <OpenInNewIcon fontSize="small" />
              </button>
              <button
                className="ghost-button icon-only-button"
                onClick={() => onRebuild(document.id)}
                disabled={isBusy}
                aria-label="重建索引"
                title="重建索引"
              >
                <RefreshIcon fontSize="small" />
              </button>
              <button
                className="ghost-button icon-only-button subtle-danger"
                onClick={() => onDelete(document.id)}
                disabled={isBusy}
                aria-label="删除知识文档"
                title="删除"
              >
                <DeleteIcon fontSize="small" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="暂无知识文档" description="导入 txt 或 md 后，AI 会在回答前检索这些资料。" />
      )}
    </article>
  );
}

function ChatDetailContent({
  selectedConversation,
  memories,
  participantLabelDraft,
  isBusy,
  channelName,
  onParticipantLabelChange,
  onSaveParticipantLabel,
}: {
  selectedConversation: ConversationSummary | null;
  memories: MemoryEntry[];
  participantLabelDraft: string;
  isBusy: boolean;
  channelName: string | null;
  onParticipantLabelChange: (value: string) => void;
  onSaveParticipantLabel: () => Promise<void>;
}) {
  const visibleMemories = memories.filter(
    (memory) => !(memory.memoryScope === "conversation" && memory.memoryType === "summary"),
  );

  return (
    <>
      <section className="detail-card detail-hero-card">
        <h3>会话信息</h3>
        {selectedConversation ? (
          <>
            <div className="detail-hero">
              <div className="detail-avatar" aria-hidden="true">
                {getConversationPreferredName(selectedConversation).slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{getConversationPreferredName(selectedConversation)}</strong>
                <p>{selectedConversation.participantLabel ?? "未命名联系人"}</p>
              </div>
            </div>
            <div className="detail-list">
              <p><span>标题</span>{getConversationPreferredName(selectedConversation)}</p>
              <p><span>渠道</span>{channelName ?? describeChannel(selectedConversation.channelType)}</p>
              <p><span>用户</span>{selectedConversation.externalUserId}</p>
            </div>
            <div className="detail-editor">
              <label className="settings-field">
                <span>联系方式 / 备注</span>
                <input
                  value={participantLabelDraft}
                  onChange={(event) => onParticipantLabelChange(event.target.value)}
                  placeholder="手动补充手机号、微信、备注名"
                  disabled={isBusy}
                />
              </label>
              <button
                className="primary-button"
                onClick={() => void onSaveParticipantLabel()}
                disabled={isBusy}
              >
                保存
              </button>
            </div>
          </>
        ) : (
          <EmptyState title="暂无会话" description="选中后可查看基本信息。" />
        )}
      </section>

      <section className="detail-card">
        <h3>用户画像与记忆</h3>
        {visibleMemories.length ? (
          <div className="memory-stack">
            {visibleMemories.map((memory) => (
              <div key={memory.id} className="memory-card">
                <div className="memory-card-top">
                  <strong>{labelMemoryType(memory.memoryType)}</strong>
                  <span>{Math.round(memory.confidence * 100)}%</span>
                </div>
                <p>{memory.summary ?? "无摘要"}</p>
                <small>{memory.content}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无记忆" description="触发学习后，这里会显示用户画像和关键事实。" />
        )}
      </section>
    </>
  );
}

function renderMessageBubble({
  message,
  layout = "default",
  editingDraft,
  editingMessageId,
  showLearnedBadge = false,
  onCancelEdit,
  onChangeEdit,
  onDelete,
  onEdit,
  onSaveEdit,
}: {
  message: ConversationMessage;
  layout?: "default" | "assistant";
  editingDraft: string;
  editingMessageId: string | null;
  showLearnedBadge?: boolean;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onDelete: (messageId: string) => Promise<void>;
  onEdit: (messageId: string, text: string) => void;
  onSaveEdit: () => Promise<void>;
}) {
  const isOutbound =
    layout === "assistant" ? message.senderType === "user" : message.messageRole === "outbound";
  const isEditing = editingMessageId === message.id;
  const canManageMessage =
    layout === "default" &&
    isOutbound &&
    !message.isDeleted &&
    (message.senderType === "human_agent" || message.senderType === "ai_agent");
  const attachment = getMessageAttachment(message);
  const bubbleSenderBadge =
    layout === "assistant" && !isOutbound
      ? { className: "ai", title: "MoonChat AI", icon: <SmartToyIcon fontSize="inherit" /> }
      : layout === "default" && isOutbound && message.senderType === "ai_agent"
        ? { className: "ai", title: "AI 回复", icon: <SmartToyIcon fontSize="inherit" /> }
        : layout === "default" && isOutbound && message.senderType === "human_agent"
          ? { className: "human", title: "人工回复", icon: <PersonIcon fontSize="inherit" /> }
          : null;
  const bubbleTitle = [
    bubbleSenderBadge?.title,
    formatDateTime(message.createdAt),
    message.editedAt ? "已编辑" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      key={message.id}
      title={bubbleTitle}
      className={
        isOutbound
          ? `chat-bubble outbound ${layout === "assistant" ? "assistant-bubble user" : ""}`.trim()
          : `chat-bubble inbound ${layout === "assistant" ? "assistant-bubble ai" : ""}`.trim()
      }
    >
      {bubbleSenderBadge ? (
        <span
          className={`bubble-sender-badge ${bubbleSenderBadge.className}`}
          title={bubbleSenderBadge.title}
          aria-label={bubbleSenderBadge.title}
        >
          {bubbleSenderBadge.icon}
        </span>
      ) : null}
      {showLearnedBadge && layout === "default" ? (
        <span className="bubble-learned-badge" title="该消息所在会话已学习" aria-label="该消息所在会话已学习">
          <AutoAwesomeIcon fontSize="inherit" />
        </span>
      ) : null}

      {isEditing ? (
        <div className="message-edit-box">
          <textarea rows={4} value={editingDraft} onChange={(event) => onChangeEdit(event.target.value)} />
          <div className="message-actions">
            <button className="ghost-button" onClick={onCancelEdit}>
              取消
            </button>
            <button className="primary-button" onClick={() => void onSaveEdit()}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
          {message.replyToMessageId ? (
            <div className="reply-reference">回复 #{message.replyToMessageId}</div>
          ) : null}
          {attachment ? <MessageAttachmentPreview attachment={attachment} /> : null}
          <p className={message.isDeleted ? "message-text deleted" : "message-text"}>
            {message.contentText || (attachment ? " " : "")}
          </p>
          {canManageMessage ? (
            <div className="message-actions bubble-hover-actions">
              {!attachment ? (
                <button
                  className="text-button icon-action-button"
                  onClick={() => onEdit(message.id, message.contentText)}
                  aria-label="编辑消息"
                  title="编辑消息"
                >
                  <EditIcon fontSize="small" />
                </button>
              ) : null}
              <button
                className="text-button danger icon-action-button"
                onClick={() => void onDelete(message.id)}
                aria-label="删除消息"
                title="删除消息"
              >
                <DeleteIcon fontSize="small" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

type RenderAttachment = {
  kind: string;
  dataUrl: string;
  mimeType: string | null;
  fileName: string | null;
};

function MessageAttachmentPreview({ attachment }: { attachment: RenderAttachment }) {
  if (attachment.kind === "image") {
    return <img className="bubble-image" src={attachment.dataUrl} alt="消息图片" />;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="bubble-media-card">
        <span>{attachment.fileName || "音频消息"}</span>
        <audio controls src={attachment.dataUrl} />
      </div>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="bubble-media-card">
        <video controls src={attachment.dataUrl} />
        <span>{attachment.fileName || "视频消息"}</span>
      </div>
    );
  }

  return (
    <a className="bubble-file-card" href={attachment.dataUrl} download={attachment.fileName || "telegram-file"}>
      <span>{attachment.fileName || "文件消息"}</span>
      <small>{attachment.mimeType || "application/octet-stream"}</small>
    </a>
  );
}

function getMessageAttachment(message: ConversationMessage): RenderAttachment | null {
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

function inferAttachmentKind(mimeType: string | null): string {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("video/")) return "video";
  return "file";
}

function inferMimeTypeFromFileName(fileName: string) {
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

function isSupportedChatAttachment(fileName: string, mimeType: string) {
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

function getDataUrlMimeType(dataUrl: string) {
  return dataUrl.match(/^data:([^;]+);base64,/)?.[1] ?? null;
}

function getConversationPreferredName(conversation: ConversationSummary) {
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

function labelSender(senderType: string) {
  if (senderType === "user") return "用户";
  if (senderType === "human_agent") return "人工";
  if (senderType === "ai_agent") return "AI";
  return senderType;
}

function describeSource(sourceType: string) {
  if (sourceType === "telegram") return "TelegramBot";
  if (sourceType === "telegram_user") return "Telegram 私人账号";
  if (sourceType === "whatsapp_personal") return "WhatsApp 私人账号";
  if (sourceType === "moonchat_ai") return "MoonChat AI";
  if (sourceType === "moonchat_human") return "人工工作台";
  if (sourceType === "local_ai") return "AI 助手";
  return sourceType;
}

function describeChannel(channelType: string) {
  if (channelType === "local_ai") return "本地 AI";
  if (channelType === "telegram") return "TelegramBot";
  if (channelType === "telegram_user") return "Telegram 私人账号";
  if (channelType === "whatsapp_personal") return "WhatsApp 私人账号";
  return channelType;
}

function labelMemoryType(memoryType: string) {
  if (memoryType === "profile") return "用户画像";
  if (memoryType === "fact") return "关键事实";
  if (memoryType === "strategy") return "沟通策略";
  if (memoryType === "summary") return "会话摘要";
  if (memoryType === "base") return "基础记忆";
  if (memoryType === "style") return "风格记忆";
  if (memoryType === "knowledge") return "知识记忆";
  return memoryType;
}

function labelKnowledgeStatus(status: KnowledgeDocumentSummary["status"]) {
  if (status === "indexed") return "已索引";
  if (status === "partial") return "部分索引";
  if (status === "failed") return "失败";
  return "等待中";
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return messageDateTimeFormatter.format(new Date(value));
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return (sameDay ? sameDayConversationTimeFormatter : olderConversationTimeFormatter).format(date);
}

function groupMessagesByDay(messages: ConversationMessage[]) {
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

function findMemoryContent(memories: MemoryEntry[], memoryType: string) {
  return memories.find((memory) => memory.memoryType === memoryType)?.content ?? "";
}

function normalizeChannels(channels: ChannelConfig[]) {
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

function createTelegramChannel(index: number): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    type: "telegram",
    name: `TelegramBot ${index}`,
    botToken: "",
    enabled: true,
  };
}

function createTelegramUserChannel(index: number): ChannelConfig {
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

function createWhatsappPersonalChannel(index: number): ChannelConfig {
  return {
    id: crypto.randomUUID(),
    type: "whatsapp_personal",
    name: `WhatsApp 私人账号 ${index}`,
    authStatePath: "",
    lastQrDataUrl: "",
    enabled: true,
  };
}

function getChannelRowStatus(
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

function readStoredView(): AppView {
  const stored = window.localStorage.getItem(workspaceViewStorageKey);
  return stored === "chat" || stored === "channels" || stored === "ai" ? stored : "ai";
}

function readStoredAiTab(): AiTab {
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

function positionCanvasAfterRender(
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

function positionElementAfterRender(element: HTMLElement | null, onPositioned?: () => void) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      element?.scrollIntoView({ block: "end" });
      onPositioned?.();
    });
  });
}

function areMessageListsEqual(current: ConversationMessage[], next: ConversationMessage[]) {
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

function areMemoryListsEqual(current: MemoryEntry[], next: MemoryEntry[]) {
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

function mergeMessageLists(olderMessages: ConversationMessage[], currentMessages: ConversationMessage[]) {
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

function findFirstUnreadInboundMessageId(
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

function writeConversationReadAt(conversationId: string, createdAt: string) {
  window.localStorage.setItem(`${chatReadAtStoragePrefix}${conversationId}`, createdAt);
}

function formatUnreadCount(count: number) {
  return count > 999 ? "..." : String(count);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}
