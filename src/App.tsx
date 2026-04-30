import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { chatReadAtStoragePrefix, messagePageSize } from "./app/constants";
import { filterConversations, filterMessages } from "./app/filters";
import { useAttachmentDraft } from "./app/useAttachmentDraft";
import { useChannelManager } from "./app/useChannelManager";
import { useConversationDisplay } from "./app/useConversationDisplay";
import { useKnowledgeManager } from "./app/useKnowledgeManager";
import { useMessageEditing } from "./app/useMessageEditing";
import { useMessageScrollPositioning } from "./app/useMessageScrollPositioning";
import { useMessageSender } from "./app/useMessageSender";
import { useSettingsManager } from "./app/useSettingsManager";
import { useAutoDismissToast } from "./app/useAutoDismissToast";
import { useStoredAiTab, useStoredWorkspaceView } from "./app/useNavigationState";
import type {
  MessageCacheEntry,
  MessageRoleFilter,
  MessageSourceFilter,
} from "./app/types";
import {
  areMemoryListsEqual,
  areMessageListsEqual,
  findFirstUnreadInboundMessageId,
  groupMessagesByDay,
  mergeMessageLists,
} from "./app/utils";
import { ChannelModal } from "./components/channels/ChannelModal";
import { AppRail } from "./components/common/AppRail";
import { ToastLayer } from "./components/common/ToastLayer";
import { AiPage } from "./pages/AiPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { ChatPage } from "./pages/ChatPage";
import type {
  ConversationMessage,
  ConversationSummary,
  MemoryEntry,
} from "./shared/contracts";

export function App() {
  const isMac = navigator.userAgent.includes("Mac");
  const [view, setView] = useStoredWorkspaceView();
  const [aiTab, setAiTab] = useStoredAiTab();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadedMessagesConversationId, setLoadedMessagesConversationId] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const messageRoleFilter: MessageRoleFilter = "all";
  const messageSourceFilter: MessageSourceFilter = "all";
  const [draft, setDraft] = useState("");
  const [participantLabelDraft, setParticipantLabelDraft] = useState("");
  const [isChatDetailDrawerOpen, setIsChatDetailDrawerOpen] = useState(false);
  const [learningConversationId, setLearningConversationId] = useState<string | null>(null);
  const [syncingHistoryConversationId, setSyncingHistoryConversationId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [unreadCountByConversationId, setUnreadCountByConversationId] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    settings,
    settingsDraft,
    setSettings,
    setSettingsDraft,
    refreshSettings,
    handleSaveModelSettings,
    handleThemeModeChange,
  } = useSettingsManager({
    setIsBusy,
    setError,
    setStatusMessage,
  });
  const {
    attachmentDraft: aiImageDraft,
    setAttachmentDraft: setAiImageDraft,
    aiImageInputRef,
    chatImageInputRef,
    clearAiAttachment,
    clearChatAttachment,
    handlePickAiImage,
    handlePickChatAttachment,
  } = useAttachmentDraft({
    setError,
    setStatusMessage,
  });
  const {
    isAddChannelModalOpen,
    newChannelDraft,
    editingChannelDraft,
    whatsappQrPendingId,
    whatsappQrError,
    whatsappConnectedById,
    channelStatusById,
    openAddChannelModal,
    closeAddChannelModal,
    openEditChannelModal,
    closeEditChannelModal,
    updateNewChannelDraft,
    updateEditingChannelDraft,
    addChannelFromModal,
    saveEditingChannel,
    removeChannel,
    toggleChannelEnabled,
    requestTelegramUserCode,
    requestWhatsappQr,
  } = useChannelManager({
    settings,
    settingsDraft,
    setSettings,
    setSettingsDraft,
    setIsBusy,
    setError,
    setStatusMessage,
  });
  const {
    knowledgeDocuments,
    knowledgeSearchDraft,
    knowledgeSearchResults,
    knowledgeEmbeddingStatus,
    knowledgeProgress,
    baseMemoryDraft,
    styleMemoryDraft,
    knowledgeMemoryDraft,
    setBaseMemoryDraft,
    setStyleMemoryDraft,
    setKnowledgeMemoryDraft,
    refreshGlobalAiMemories,
    refreshKnowledgeBase,
    handleSaveAiMemory,
    handleImportKnowledgeFiles,
    handleDeleteKnowledgeDocument,
    handleRebuildKnowledgeDocument,
    handleOpenKnowledgeDocument,
    handleSearchKnowledge,
    handleRefreshKnowledgeBase,
    handleKnowledgeSearchDraftChange,
    handleToggleRagTool,
  } = useKnowledgeManager({
    settings,
    settingsDraft,
    setSettings,
    setSettingsDraft,
    setIsBusy,
    setError,
    setStatusMessage,
    refreshWorkspace,
  });
  const aiComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const aiMessageCanvasRef = useRef<HTMLDivElement | null>(null);
  const chatMessageCanvasRef = useRef<HTMLDivElement | null>(null);
  const chatUnreadAnchorRef = useRef<HTMLDivElement | null>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const liveRefreshRunningRef = useRef(false);
  const pendingConversationChangeRef = useRef<{ conversationId: string | null } | null>(null);
  const latestMessageRequestRef = useRef<string | null>(null);
  const previousLoadedSelectionRef = useRef<string | null>(null);
  const messageCacheRef = useRef(new Map<string, MessageCacheEntry>());
  const memoryCacheRef = useRef(new Map<string, MemoryEntry[]>());
  const isPrependingOlderMessagesRef = useRef(false);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const localAiConversation =
    conversations.find((conversation) => conversation.channelType === "local_ai") ?? null;
  const {
    editingMessageId,
    editingDraft,
    setEditingDraft,
    cancelEdit,
    startEdit,
    saveEdit,
    deleteMessage,
  } = useMessageEditing({
    selectedConversationId,
    selectedConversation,
    refreshWorkspace,
    refreshMessages,
    refreshMemories,
    setIsBusy,
    setError,
    setStatusMessage,
  });
  const isAssistantView = view === "ai" && aiTab === "assistant";
  const activeConversation =
    view === "ai" && aiTab === "assistant" ? localAiConversation : selectedConversation;
  const { sendMessage } = useMessageSender({
    isAssistantView,
    activeConversation,
    selectedConversationId,
    conversations,
    draft,
    attachmentDraft: aiImageDraft,
    aiImageInputRef,
    chatImageInputRef,
    aiMessagesEndRef,
    aiComposerTextareaRef,
    setDraft,
    setAttachmentDraft: setAiImageDraft,
    setMessages,
    setIsBusy,
    setError,
    setStatusMessage,
    refreshWorkspace,
    refreshMessages,
    refreshMemories,
  });
  const hasAiHistory = view === "ai" && aiTab === "assistant" && messages.length > 0;
  const selectedConversationSupportsImages =
    isAssistantView ||
    selectedConversation?.channelType === "telegram" ||
    selectedConversation?.channelType === "telegram_user";
  const {
    channelConversations,
    channelNameById,
    getConversationChannelName,
    getConversationDisplayName,
  } = useConversationDisplay({ settings, conversations });
  const firstChannelConversationId = channelConversations[0]?.id ?? null;
  const themeMode = settings.ui.themeMode;

  useEffect(() => {
    document.body.dataset.theme = themeMode;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [themeMode]);

  const filteredConversations = useMemo(() => {
    return filterConversations(channelConversations, conversationSearch, getConversationChannelName);
  }, [channelConversations, channelNameById, conversationSearch]);

  const filteredMessages = useMemo(() => {
    return filterMessages({
      messages,
      keyword: messageSearch,
      role: messageRoleFilter,
      source: messageSourceFilter,
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
  const { readyAiConversationId, readyChatConversationId } = useMessageScrollPositioning({
    isAssistantView,
    view,
    activeConversationId: activeConversation?.id ?? null,
    selectedConversationId,
    loadedMessagesConversationId,
    messageCount: messages.length,
    latestMessageCreatedAt: messages.at(-1)?.createdAt ?? null,
    isPrependingOlderMessagesRef,
    aiMessagesEndRef,
    chatMessageCanvasRef,
    chatUnreadAnchorRef,
    setUnreadCountByConversationId,
  });

  async function refreshWorkspace() {
    const [, conversationList] = await Promise.all([
      window.moonchat.getDashboardSnapshot(),
      window.moonchat.listConversations(),
    ]);

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

  useEffect(() => {
    void refreshAll();
  }, []);

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

  useAutoDismissToast({
    error,
    statusMessage,
    onClear: () => {
      setError(null);
      setStatusMessage(null);
    },
  });

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
      cancelEdit();
      setDraft("");
      clearAiAttachment();
      await refreshWorkspace();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "清空聊天记录失败。");
    } finally {
      setIsBusy(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="feishu-shell" data-theme={themeMode} data-platform={isMac ? "mac" : "other"}>
      {isMac ? <div className="window-drag-strip" aria-hidden="true" /> : null}

      {isAddChannelModalOpen ? (
        <ChannelModal
          mode="add"
          draft={newChannelDraft}
          channelCount={settingsDraft.channels.length}
          isBusy={isBusy}
          whatsappQrPendingId={whatsappQrPendingId}
          whatsappQrError={whatsappQrError}
          whatsappConnectedById={whatsappConnectedById}
          onClose={closeAddChannelModal}
          onDraftChange={updateNewChannelDraft}
          onSubmit={() => void addChannelFromModal()}
          onRequestTelegramUserCode={(channel, applySession) =>
            void requestTelegramUserCode(channel, applySession)
          }
          onRequestWhatsappQr={(channel, applyQr) => void requestWhatsappQr(channel, applyQr)}
        />
      ) : null}

      {editingChannelDraft ? (
        <ChannelModal
          mode="edit"
          draft={editingChannelDraft}
          channelCount={settingsDraft.channels.length}
          isBusy={isBusy}
          whatsappQrPendingId={whatsappQrPendingId}
          whatsappQrError={whatsappQrError}
          whatsappConnectedById={whatsappConnectedById}
          onClose={closeEditChannelModal}
          onDraftChange={updateEditingChannelDraft}
          onSubmit={() => void saveEditingChannel()}
          onRequestTelegramUserCode={(channel, applySession) =>
            void requestTelegramUserCode(channel, applySession)
          }
          onRequestWhatsappQr={(channel, applyQr) => void requestWhatsappQr(channel, applyQr)}
        />
      ) : null}

      <ToastLayer
        error={error}
        statusMessage={statusMessage}
        onClearError={() => setError(null)}
        onClearStatus={() => setStatusMessage(null)}
      />

      <AppRail
        view={view}
        themeMode={themeMode}
        onViewChange={setView}
        onThemeModeChange={(nextThemeMode) => void handleThemeModeChange(nextThemeMode)}
      />

      {view === "chat" ? (
        <ChatPage
          channelConversations={channelConversations}
          filteredConversations={filteredConversations}
          selectedConversation={selectedConversation}
          selectedConversationId={selectedConversationId}
          conversationMessages={messages}
          filteredMessages={filteredMessages}
          groupedChatMessages={groupedChatMessages}
          unreadCountByConversationId={unreadCountByConversationId}
          conversationSearch={conversationSearch}
          messageSearch={messageSearch}
          draft={draft}
          aiImageDraft={aiImageDraft}
          editingDraft={editingDraft}
          editingMessageId={editingMessageId}
          learnedAtTimestamp={learnedAtTimestamp}
          chatUnreadMessageId={chatUnreadMessageId}
          loadedMessagesConversationId={loadedMessagesConversationId}
          readyChatConversationId={readyChatConversationId}
          hasOlderMessages={hasOlderMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
          isBusy={isBusy}
          selectedConversationSupportsImages={selectedConversationSupportsImages}
          memories={memories}
          participantLabelDraft={participantLabelDraft}
          isChatDetailDrawerOpen={isChatDetailDrawerOpen}
          learningConversationId={learningConversationId}
          syncingHistoryConversationId={syncingHistoryConversationId}
          chatMessageCanvasRef={chatMessageCanvasRef}
          chatUnreadAnchorRef={chatUnreadAnchorRef}
          chatMessagesEndRef={chatMessagesEndRef}
          chatImageInputRef={chatImageInputRef}
          getConversationChannelName={getConversationChannelName}
          getConversationDisplayName={getConversationDisplayName}
          onRefreshWorkspace={() => void refreshWorkspace()}
          onConversationSearchChange={setConversationSearch}
          onMessageSearchChange={setMessageSearch}
          onSelectConversation={(conversationId) => {
            setSelectedConversationId(conversationId);
            cancelEdit();
          }}
          onToggleAutoReply={async (conversation) => {
            await window.moonchat.toggleAutoReply(conversation.id, !conversation.autoReplyEnabled);
            await refreshWorkspace();
          }}
          onTriggerLearning={() => void handleTriggerLearning()}
          onSyncTelegramUserRecentHistory={() => void handleSyncTelegramUserRecentHistory()}
          onOpenChatDetailDrawer={() => setIsChatDetailDrawerOpen(true)}
          onCloseChatDetailDrawer={() => setIsChatDetailDrawerOpen(false)}
          onLoadOlderMessages={() => void loadOlderMessages()}
          onCancelEdit={cancelEdit}
          onChangeEdit={setEditingDraft}
          onDeleteMessage={deleteMessage}
          onEditMessage={startEdit}
          onSaveEdit={saveEdit}
          onRemoveAttachment={clearChatAttachment}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onPickChatAttachment={(event) => void handlePickChatAttachment(event)}
          onSendMessage={() => void sendMessage()}
          onParticipantLabelChange={setParticipantLabelDraft}
          onSaveParticipantLabel={handleSaveParticipantLabel}
        />
      ) : view === "ai" ? (
        <AiPage
          aiTab={aiTab}
          settingsDraft={settingsDraft}
          hasAiHistory={hasAiHistory}
          activeConversation={activeConversation}
          messages={messages}
          groupedAssistantMessages={groupedAssistantMessages}
          loadedMessagesConversationId={loadedMessagesConversationId}
          readyAiConversationId={readyAiConversationId}
          editingDraft={editingDraft}
          editingMessageId={editingMessageId}
          draft={draft}
          aiImageDraft={aiImageDraft}
          isBusy={isBusy}
          baseMemoryDraft={baseMemoryDraft}
          styleMemoryDraft={styleMemoryDraft}
          knowledgeMemoryDraft={knowledgeMemoryDraft}
          knowledgeDocuments={knowledgeDocuments}
          knowledgeEmbeddingStatus={knowledgeEmbeddingStatus}
          knowledgeProgress={knowledgeProgress}
          knowledgeSearchDraft={knowledgeSearchDraft}
          knowledgeSearchResults={knowledgeSearchResults}
          aiMessageCanvasRef={aiMessageCanvasRef}
          aiMessagesEndRef={aiMessagesEndRef}
          aiComposerTextareaRef={aiComposerTextareaRef}
          aiImageInputRef={aiImageInputRef}
          onAiTabChange={setAiTab}
          onClearAiChat={() => void handleClearAiChat()}
          onCancelEdit={cancelEdit}
          onChangeEdit={setEditingDraft}
          onDeleteMessage={deleteMessage}
          onEditMessage={startEdit}
          onSaveEdit={saveEdit}
          onDraftChange={setDraft}
          onComposerKeyDown={handleComposerKeyDown}
          onPickAiImage={(event) => void handlePickAiImage(event)}
          onRemoveAiImage={clearAiAttachment}
          onSendMessage={() => void sendMessage()}
          onBaseMemoryDraftChange={setBaseMemoryDraft}
          onStyleMemoryDraftChange={setStyleMemoryDraft}
          onKnowledgeMemoryDraftChange={setKnowledgeMemoryDraft}
          onSaveAiMemory={(memoryType, content, summary) =>
            void handleSaveAiMemory(memoryType, content, summary)
          }
          onImportKnowledgeFiles={() => void handleImportKnowledgeFiles()}
          onRefreshKnowledgeBase={() => void handleRefreshKnowledgeBase()}
          onToggleRagTool={(enabled) => void handleToggleRagTool(enabled)}
          onDeleteKnowledgeDocument={(documentId) => void handleDeleteKnowledgeDocument(documentId)}
          onRebuildKnowledgeDocument={(documentId) => void handleRebuildKnowledgeDocument(documentId)}
          onOpenKnowledgeDocument={(documentId) => void handleOpenKnowledgeDocument(documentId)}
          onKnowledgeSearchDraftChange={handleKnowledgeSearchDraftChange}
          onSearchKnowledge={() => void handleSearchKnowledge()}
          onSettingsDraftChange={setSettingsDraft}
          onSaveModelSettings={() => void handleSaveModelSettings()}
        />
      ) : (
        <ChannelsPage
          settingsDraft={settingsDraft}
          channelStatusById={channelStatusById}
          isBusy={isBusy}
          onOpenAddChannelModal={openAddChannelModal}
          onOpenEditChannelModal={openEditChannelModal}
          onRemoveChannel={(channelId) => void removeChannel(channelId)}
          onToggleChannelEnabled={(channel) => void toggleChannelEnabled(channel)}
        />
      )}
    </main>
  );
}
