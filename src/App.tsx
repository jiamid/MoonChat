import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SettingsIcon from "@mui/icons-material/Settings";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import logoSrc from "../logo.png";
import type {
  AppDashboardSnapshot,
  AppSettings,
  ConversationMessage,
  ConversationSummary,
  MemoryEntry,
} from "./shared/contracts";

type MessageRoleFilter = "all" | "inbound" | "outbound";
type MessageSourceFilter = "all" | "telegram" | "moonchat_ai" | "moonchat_human";
type AppView = "chat" | "ai" | "settings";
type AiTab = "assistant" | "base" | "style" | "knowledge" | "model";
type ThemeMode = "light" | "dark";

const defaultSettings: AppSettings = {
  ui: { themeMode: "dark" },
  telegram: { botToken: "" },
  ai: {
    provider: "openai",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    temperature: 0.4,
    systemPrompt:
      "你是 MoonChat 的 AI 助手，负责在聊天聚合工作台里协助进行自然、稳妥、贴近上下文的回复。",
  },
};

export function App() {
  const isMac = navigator.userAgent.includes("Mac");
  const [view, setView] = useState<AppView>("ai");
  const [aiTab, setAiTab] = useState<AiTab>("assistant");
  const [dashboard, setDashboard] = useState<AppDashboardSnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [globalAiMemories, setGlobalAiMemories] = useState<MemoryEntry[]>([]);
  const [baseMemoryDraft, setBaseMemoryDraft] = useState("");
  const [styleMemoryDraft, setStyleMemoryDraft] = useState("");
  const [knowledgeMemoryDraft, setKnowledgeMemoryDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageRoleFilter, setMessageRoleFilter] = useState<MessageRoleFilter>("all");
  const [messageSourceFilter, setMessageSourceFilter] = useState<MessageSourceFilter>("all");
  const [draft, setDraft] = useState("");
  const [aiImageDraft, setAiImageDraft] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [participantLabelDraft, setParticipantLabelDraft] = useState("");
  const [learningConversationId, setLearningConversationId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiImageInputRef = useRef<HTMLInputElement | null>(null);
  const aiComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousAiMessageCountRef = useRef(0);
  const previousChatMessageCountRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const liveRefreshRunningRef = useRef(false);
  const pendingConversationChangeRef = useRef<{ conversationId: string | null } | null>(null);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const localAiConversation =
    conversations.find((conversation) => conversation.channelType === "local_ai") ?? null;
  const activeConversation =
    view === "ai" && aiTab === "assistant" ? localAiConversation : selectedConversation;
  const hasAiHistory = view === "ai" && aiTab === "assistant" && messages.length > 0;
  const channelConversations = conversations.filter(
    (conversation) => conversation.channelType !== "local_ai",
  );
  const firstChannelConversationId = channelConversations[0]?.id ?? null;
  const themeMode = settings.ui.themeMode;
  const isAssistantView = view === "ai" && aiTab === "assistant";

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
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [channelConversations, conversationSearch]);

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

  async function refreshWorkspace() {
    const [snapshot, conversationList] = await Promise.all([
      window.moonchat.getDashboardSnapshot(),
      window.moonchat.listConversations(),
    ]);

    setDashboard(snapshot);
    setConversations(conversationList);
    setSelectedConversationId((current) => {
      if (current && conversationList.some((item) => item.id === current)) {
        return current;
      }
      return conversationList.find((item) => item.channelType !== "local_ai")?.id ?? null;
    });

    return conversationList;
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

  async function refreshMessages(conversationId: string) {
    setMessages(await window.moonchat.getConversationMessages(conversationId));
  }

  async function refreshMemories(conversation: ConversationSummary) {
    setMemories(
      await window.moonchat.listRelevantMemories({
        conversationId: conversation.id,
        userId: conversation.externalUserId,
      }),
    );
  }

  async function refreshAll() {
    await Promise.all([refreshWorkspace(), refreshSettings(), refreshGlobalAiMemories()]);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setMemories([]);
      return;
    }

    const conversation = conversations.find((item) => item.id === selectedConversationId);
    void refreshMessages(selectedConversationId);
    if (conversation) {
      void refreshMemories(conversation);
    }
  }, [selectedConversationId, conversations]);

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

  useEffect(() => {
    const hasNewAssistantMessage =
      isAssistantView &&
      messages.length > previousAiMessageCountRef.current;

    if (hasNewAssistantMessage) {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    previousAiMessageCountRef.current = messages.length;
  }, [isAssistantView, messages]);

  useEffect(() => {
    const hasNewChatMessage =
      view === "chat" &&
      messages.length > previousChatMessageCountRef.current;

    if (hasNewChatMessage) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    previousChatMessageCountRef.current = messages.length;
  }, [messages, view]);

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

        if (nextSelectedConversationId) {
          await refreshMessages(nextSelectedConversationId);
        } else {
          setMessages([]);
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

  async function handleSendMessage() {
    const targetConversationId = isAssistantView ? activeConversation?.id : selectedConversationId;
    const nextText = draft.trim();
    const canSendImageOnly = isAssistantView && Boolean(aiImageDraft);
    const optimisticImageDraft = aiImageDraft;
    const isAiAssistantSend = isAssistantView && Boolean(activeConversation);

    if (!targetConversationId || (!nextText && !canSendImageOnly)) {
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
          contentType: optimisticImageDraft ? "text_image" : "text",
          attachmentImageDataUrl: optimisticImageDraft?.dataUrl ?? null,
          attachmentMimeType: optimisticImageDraft?.mimeType ?? null,
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
        aiMessagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        aiComposerTextareaRef.current?.focus();
      });
    }

    try {
      await window.moonchat.sendManualMessage(targetConversationId, nextText, {
        imageDataUrl: optimisticImageDraft?.dataUrl,
        imageMimeType: optimisticImageDraft?.mimeType,
      });
      if (!isAiAssistantSend) {
        setDraft("");
        setAiImageDraft(null);
        if (aiImageInputRef.current) {
          aiImageInputRef.current.value = "";
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
        setAiImageDraft(optimisticImageDraft);
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
        ai: {
          provider: settingsDraft.ai.provider.trim() || "openai",
          apiKey: settingsDraft.ai.apiKey.trim(),
          baseUrl: settingsDraft.ai.baseUrl.trim(),
          model: settingsDraft.ai.model.trim(),
          temperature: Number(settingsDraft.ai.temperature),
          systemPrompt: settingsDraft.ai.systemPrompt.trim(),
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

  async function handleSaveTelegramSettings() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        ui: settingsDraft.ui,
        telegram: { botToken: settingsDraft.telegram.botToken.trim() },
        ai: settingsDraft.ai,
      });
      setSettings(saved);
      setSettingsDraft(saved);
      setStatusMessage("Telegram 配置已保存并重连。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存 Telegram 配置失败。");
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
      setStatusMessage(nextThemeMode === "dark" ? "已切换到暗黑模式。" : "已切换到明亮模式。");
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
    setAiImageDraft({ dataUrl, mimeType: file.type });
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

  return (
    <main className="feishu-shell" data-theme={themeMode} data-platform={isMac ? "mac" : "other"}>
      {isMac ? <div className="window-drag-strip" aria-hidden="true" /> : null}

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
            AI
          </button>
          <button
            className={view === "chat" ? "rail-button active" : "rail-button"}
            onClick={() => setView("chat")}
          >
            消息
          </button>
        </div>

        <div className="rail-footer">
          <button
            className="rail-button rail-theme-button"
            onClick={() => void handleThemeModeChange(themeMode === "dark" ? "light" : "dark")}
            aria-label={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
            title={themeMode === "dark" ? "切换到明亮模式" : "切换到暗黑模式"}
          >
            <span aria-hidden="true">
              {themeMode === "dark" ? <LightModeIcon fontSize="inherit" /> : <DarkModeIcon fontSize="inherit" />}
            </span>
          </button>
          <button
            className={
              view === "settings"
                ? "rail-button rail-gear-button active"
                : "rail-button rail-gear-button"
            }
            onClick={() => setView("settings")}
            aria-label="设置"
            title="设置"
          >
            <span aria-hidden="true">
              <SettingsIcon fontSize="inherit" />
            </span>
          </button>
        </div>
      </aside>

      {view === "chat" ? (
        <>
          <section className="session-pane chat-session-pane">
            <header className="pane-header">
              <div>
                <h1>消息</h1>
              </div>
              <button className="ghost-button" onClick={() => void refreshWorkspace()}>
                刷新
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
                  description="配置 Telegram 后，消息会自动进入这里。"
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
                        {conversation.title.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="session-card-main">
                        <div className="session-title-row">
                          <strong>{conversation.title}</strong>
                        </div>
                        <p>{conversation.externalUserId}</p>
                      </div>
                    </div>
                    <div className="session-meta-row session-meta-row-bottom">
                      <span className="meta-tag">{describeChannel(conversation.channelType)}</span>
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
                    {selectedConversation.title.slice(0, 1).toUpperCase()}
                  </div>
                ) : null}
                <div>
                <h2>{selectedConversation?.title ?? "选择一个会话"}</h2>
                <p>
                  {selectedConversation
                    ? `${describeChannel(selectedConversation.channelType)} / ${
                        selectedConversation.participantLabel ?? selectedConversation.externalUserId
                      }`
                    : "在左侧选择一个会话开始处理消息"}
                </p>
                </div>
              </div>
              {selectedConversation ? (
                <div className="topbar-actions">
                  <button
                    className={selectedConversation.autoReplyEnabled ? "toggle active" : "toggle"}
                    onClick={async () => {
                      await window.moonchat.toggleAutoReply(
                        selectedConversation.id,
                        !selectedConversation.autoReplyEnabled,
                      );
                      await refreshWorkspace();
                    }}
                  >
                    {selectedConversation.autoReplyEnabled ? "关闭自动回复" : "开启自动回复"}
                  </button>
                  <button
                    className="ghost-button"
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
                      "学习会话"
                    )}
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

              <div className="message-canvas chat-message-canvas">
                {!selectedConversation ? (
                  <EmptyState title="还没有打开会话" description="选择左侧会话后，在这里查看与回复消息。" />
                ) : filteredMessages.length === 0 ? (
                  <EmptyState title="没有匹配的消息" description="可以清空筛选条件，或等待新消息进来。" />
                ) : (
                  <>
                    {selectedConversation.learningStatus === "running" ? (
                      <div className="thread-status-banner">
                        <span className="inline-spinner" aria-hidden="true" />
                        该会话正在学习中
                      </div>
                    ) : null}
                    {groupMessagesByDay(filteredMessages).map((group) => (
                      <div key={group.label} className="message-group">
                        <div className="message-group-label">{group.label}</div>
                        {group.items.map((message) =>
                          renderMessageBubble({
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
                          }),
                        )}
                      </div>
                    ))}
                  </>
                )}
                <div ref={chatMessagesEndRef} />
              </div>

              <footer className="composer chat-composer">
                <textarea
                  rows={4}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={selectedConversation ? "输入人工回复内容" : "先选择会话"}
                  disabled={!selectedConversation || isBusy}
                />
                <div className="composer-actions">
                  <span>Telegram 会话会同时发回 Telegram，并写入本地记录。</span>
                  <button
                    className="primary-button"
                    onClick={() => void handleSendMessage()}
                    disabled={!selectedConversation || !draft.trim() || isBusy}
                  >
                    发送
                  </button>
                </div>
              </footer>
            </section>
          </section>

          <aside className="detail-pane chat-detail-pane">
            <section className="detail-card detail-hero-card">
              <h3>会话信息</h3>
              {selectedConversation ? (
                <>
                  <div className="detail-hero">
                    <div className="detail-avatar" aria-hidden="true">
                      {selectedConversation.title.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{selectedConversation.title}</strong>
                      <p>{selectedConversation.participantLabel ?? "未命名联系人"}</p>
                    </div>
                  </div>
                  <div className="detail-list">
                    <p><span>标题</span>{selectedConversation.title}</p>
                    <p><span>渠道</span>{describeChannel(selectedConversation.channelType)}</p>
                    <p><span>用户</span>{selectedConversation.externalUserId}</p>
                  </div>
                  <div className="detail-editor">
                    <label className="settings-field">
                      <span>联系方式 / 备注</span>
                      <input
                        value={participantLabelDraft}
                        onChange={(event) => setParticipantLabelDraft(event.target.value)}
                        placeholder="手动补充手机号、微信、备注名"
                        disabled={isBusy}
                      />
                    </label>
                    <button
                      className="primary-button"
                      onClick={() => void handleSaveParticipantLabel()}
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
              {memories.length ? (
                <div className="memory-stack">
                  {memories.map((memory) => (
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
              <button className={aiTab === "assistant" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("assistant")}>AI助手</button>
              <button className={aiTab === "base" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("base")}>基础记忆</button>
              <button className={aiTab === "style" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("style")}>风格记忆</button>
              <button className={aiTab === "knowledge" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("knowledge")}>知识记忆</button>
              <button className={aiTab === "model" ? "ai-tab active" : "ai-tab"} onClick={() => setAiTab("model")}>模型</button>
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
                        className="ghost-button subtle-danger"
                        onClick={() => void handleClearAiChat()}
                        disabled={!activeConversation || messages.length === 0 || isBusy}
                      >
                        清空聊天
                      </button>
                    </div>
                    <div className="message-canvas assistant-message-canvas">
                      {!activeConversation ? (
                        <EmptyState title="AI 助手暂不可用" description="请刷新页面后再试。" />
                      ) : (
                        groupMessagesByDay(messages).map((group) => (
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
                      <img src={aiImageDraft.dataUrl} alt="待发送图片" />
                      <div className="attachment-preview-meta">
                        <strong>待发送图片</strong>
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
                      className="primary-button"
                      onClick={() => void handleSendMessage()}
                      disabled={
                        !activeConversation || (!draft.trim() && !aiImageDraft) || isBusy
                      }
                    >
                      发送
                    </button>
                  </div>
                </footer>
              </section>
            ) : aiTab === "base" ? (
              <>
              <MemoryEditor
                title="基础记忆"
                description="定义 AI 的身份、边界、原则和长期行为约束。"
                value={baseMemoryDraft}
                onChange={setBaseMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("base", baseMemoryDraft, "AI base memory")
                }
              />
              </>
            ) : aiTab === "style" ? (
              <>
              <MemoryEditor
                title="风格记忆"
                description="定义说话方式、长度偏好、情绪风格、常用表达。"
                value={styleMemoryDraft}
                onChange={setStyleMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("style", styleMemoryDraft, "AI style memory")
                }
              />
              </>
            ) : aiTab === "knowledge" ? (
              <>
              <MemoryEditor
                title="知识记忆"
                description="沉淀产品信息、FAQ、规则、业务知识和常见判断依据。"
                value={knowledgeMemoryDraft}
                onChange={setKnowledgeMemoryDraft}
                onSave={() =>
                  void handleSaveAiMemory("knowledge", knowledgeMemoryDraft, "AI knowledge memory")
                }
              />
              </>
            ) : (
              <>
                <article className="settings-panel">
                <div className="pane-header">
                  <div>
                    <h1>模型</h1>
                    <p>配置 OpenAI 兼容协议、模型和系统提示词。</p>
                  </div>
                </div>
                <div className="settings-grid">
                  <label className="settings-field">
                    <span>协议提供方</span>
                    <input
                      value={settingsDraft.ai.provider}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          ai: { ...current.ai, provider: event.target.value },
                        }))
                      }
                    />
                  </label>
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
                    <span>系统提示词</span>
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
        <section className="settings-layout">
          <article className="settings-panel">
            <div className="pane-header">
              <div>
                <h1>设置</h1>
                <p>这里保留客户端级配置</p>
              </div>
            </div>
            <div className="settings-grid">
              <label className="settings-field">
                <span>界面主题</span>
                <select
                  value={settingsDraft.ui.themeMode}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      ui: { themeMode: event.target.value as ThemeMode },
                    }))
                  }
                >
                  <option value="dark">暗黑模式</option>
                  <option value="light">明亮模式</option>
                </select>
              </label>
              <label className="settings-field settings-field-wide">
                <span>Telegram Bot Token</span>
                <input
                  type="password"
                  value={settingsDraft.telegram.botToken}
                  onChange={(event) =>
                    setSettingsDraft((current) => ({
                      ...current,
                      telegram: { ...current.telegram, botToken: event.target.value },
                    }))
                  }
                />
              </label>
            </div>
            <div className="settings-actions">
              <button className="primary-button" onClick={() => void handleSaveTelegramSettings()}>
                保存客户端设置
              </button>
            </div>
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

  return (
    <div
      key={message.id}
      className={
        isOutbound
          ? `chat-bubble outbound ${layout === "assistant" ? "assistant-bubble user" : ""}`.trim()
          : `chat-bubble inbound ${layout === "assistant" ? "assistant-bubble ai" : ""}`.trim()
      }
    >
      {showLearnedBadge && layout === "default" ? (
        <span className="bubble-learned-badge" title="该消息所在会话已学习" aria-label="该消息所在会话已学习">
          <AutoAwesomeIcon fontSize="inherit" />
        </span>
      ) : null}
      <div className="bubble-meta">
        {layout === "assistant" ? (
          <>
            {!isOutbound ? <span className="meta-pill">MoonChat AI</span> : null}
            <span>{formatDateTime(message.createdAt)}</span>
          </>
        ) : !isOutbound ? (
          <span>{formatDateTime(message.createdAt)}</span>
        ) : (
          <>
            <span className="meta-pill">{labelWorkbenchSender(message.senderType)}</span>
            <span>{formatDateTime(message.createdAt)}</span>
          </>
        )}
        {message.editedAt ? <span>已编辑</span> : null}
      </div>

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
          {message.attachmentImageDataUrl ? (
            <img
              className="bubble-image"
              src={message.attachmentImageDataUrl}
              alt="消息图片"
            />
          ) : null}
          <p className={message.isDeleted ? "message-text deleted" : "message-text"}>
            {message.contentText || (message.attachmentImageDataUrl ? " " : "")}
          </p>
          {canManageMessage ? (
            <div className="message-actions">
              {!message.attachmentImageDataUrl ? (
                <button className="text-button" onClick={() => onEdit(message.id, message.contentText)}>
                  编辑
                </button>
              ) : null}
              <button className="text-button danger" onClick={() => void onDelete(message.id)}>
                删除
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

function labelSender(senderType: string) {
  if (senderType === "user") return "用户";
  if (senderType === "human_agent") return "人工";
  if (senderType === "ai_agent") return "AI";
  return senderType;
}

function labelWorkbenchSender(senderType: string) {
  if (senderType === "ai_agent") return "AI";
  return "人工";
}

function describeSource(sourceType: string) {
  if (sourceType === "telegram") return "Telegram";
  if (sourceType === "moonchat_ai") return "MoonChat AI";
  if (sourceType === "moonchat_human") return "人工工作台";
  if (sourceType === "local_ai") return "AI 助手";
  return sourceType;
}

function describeChannel(channelType: string) {
  if (channelType === "local_ai") return "本地 AI";
  if (channelType === "telegram") return "Telegram";
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return new Intl.DateTimeFormat("zh-CN", sameDay ? {
    hour: "2-digit",
    minute: "2-digit",
  } : {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function groupMessagesByDay(messages: ConversationMessage[]) {
  const groups = new Map<string, ConversationMessage[]>();

  for (const message of messages) {
    const label = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(message.createdAt));
    groups.set(label, [...(groups.get(label) ?? []), message]);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function findMemoryContent(memories: MemoryEntry[], memoryType: string) {
  return memories.find((memory) => memory.memoryType === memoryType)?.content ?? "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败。"));
    reader.readAsDataURL(file);
  });
}
