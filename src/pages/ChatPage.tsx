import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import PsychologyIcon from "@mui/icons-material/Psychology";
import RefreshIcon from "@mui/icons-material/Refresh";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SyncIcon from "@mui/icons-material/Sync";
import type { ConversationMessage, ConversationSummary, MemoryEntry } from "../shared/contracts";
import type { AttachmentDraft } from "../app/types";
import { chatAttachmentAccept } from "../app/constants";
import {
  chatMessageElementId,
  formatConversationTime,
  formatUnreadCount,
  scrollChatMessageIntoView,
} from "../app/utils";
import { ChatDetailContent } from "../components/chat/ChatDetailContent";
import { EmptyState } from "../components/common/EmptyState";
import { MessageAttachmentPreview } from "../components/messages/MessageAttachmentPreview";
import { MessageBubble } from "../components/messages/MessageBubble";

type MessageGroup = {
  label: string;
  items: ConversationMessage[];
};

export function ChatPage({
  channelConversations,
  filteredConversations,
  selectedConversation,
  selectedConversationId,
  conversationMessages,
  filteredMessages,
  groupedChatMessages,
  unreadCountByConversationId,
  conversationSearch,
  messageSearch,
  draft,
  aiImageDraft,
  editingDraft,
  editingMessageId,
  learnedAtTimestamp,
  chatUnreadMessageId,
  loadedMessagesConversationId,
  readyChatConversationId,
  hasOlderMessages,
  isLoadingOlderMessages,
  isBusy,
  selectedConversationSupportsImages,
  memories,
  participantLabelDraft,
  isChatDetailDrawerOpen,
  learningConversationId,
  syncingHistoryConversationId,
  chatMessageCanvasRef,
  chatUnreadAnchorRef,
  chatMessagesEndRef,
  chatImageInputRef,
  getConversationChannelName,
  getConversationDisplayName,
  onRefreshWorkspace,
  onConversationSearchChange,
  onMessageSearchChange,
  onSelectConversation,
  onToggleAutoReply,
  onTriggerLearning,
  onSyncTelegramUserRecentHistory,
  onOpenChatDetailDrawer,
  onCloseChatDetailDrawer,
  onLoadOlderMessages,
  onCancelEdit,
  onChangeEdit,
  onDeleteMessage,
  onEditMessage,
  onSaveEdit,
  onRemoveAttachment,
  onDraftChange,
  onComposerKeyDown,
  onPickChatAttachment,
  onSendMessage,
  onParticipantLabelChange,
  onSaveParticipantLabel,
}: {
  channelConversations: ConversationSummary[];
  filteredConversations: ConversationSummary[];
  selectedConversation: ConversationSummary | null;
  selectedConversationId: string | null;
  /** 当前会话已加载的完整消息列表，用于解析回复引用中的原文摘要 */
  conversationMessages: ConversationMessage[];
  filteredMessages: ConversationMessage[];
  groupedChatMessages: MessageGroup[];
  unreadCountByConversationId: Record<string, number>;
  conversationSearch: string;
  messageSearch: string;
  draft: string;
  aiImageDraft: AttachmentDraft | null;
  editingDraft: string;
  editingMessageId: string | null;
  learnedAtTimestamp: number | null;
  chatUnreadMessageId: string | null;
  loadedMessagesConversationId: string | null;
  readyChatConversationId: string | null;
  hasOlderMessages: boolean;
  isLoadingOlderMessages: boolean;
  isBusy: boolean;
  selectedConversationSupportsImages: boolean;
  memories: MemoryEntry[];
  participantLabelDraft: string;
  isChatDetailDrawerOpen: boolean;
  learningConversationId: string | null;
  syncingHistoryConversationId: string | null;
  chatMessageCanvasRef: RefObject<HTMLDivElement | null>;
  chatUnreadAnchorRef: RefObject<HTMLDivElement | null>;
  chatMessagesEndRef: RefObject<HTMLDivElement | null>;
  chatImageInputRef: RefObject<HTMLInputElement | null>;
  getConversationChannelName: (conversation: ConversationSummary) => string;
  getConversationDisplayName: (conversation: ConversationSummary) => string;
  onRefreshWorkspace: () => void;
  onConversationSearchChange: (value: string) => void;
  onMessageSearchChange: (value: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onToggleAutoReply: (conversation: ConversationSummary) => Promise<void>;
  onTriggerLearning: () => void;
  onSyncTelegramUserRecentHistory: () => void;
  onOpenChatDetailDrawer: () => void;
  onCloseChatDetailDrawer: () => void;
  onLoadOlderMessages: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => void;
  onSaveEdit: () => Promise<void>;
  onRemoveAttachment: () => void;
  onDraftChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPickChatAttachment: (event: ChangeEvent<HTMLInputElement>) => void;
  onSendMessage: () => void;
  onParticipantLabelChange: (value: string) => void;
  onSaveParticipantLabel: () => Promise<void>;
}) {
  return (
    <>
      <section className="session-pane chat-session-pane">
        <header className="pane-header">
          <div>
            <h1>消息</h1>
          </div>
          <button
            className="ghost-button icon-only-button"
            onClick={onRefreshWorkspace}
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
            onChange={(event) => onConversationSearchChange(event.target.value)}
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
                className={conversation.id === selectedConversationId ? "session-item active" : "session-item"}
                onClick={() => onSelectConversation(conversation.id)}
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
                onClick={() => void onToggleAutoReply(selectedConversation)}
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
                onClick={onTriggerLearning}
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
                  onClick={onSyncTelegramUserRecentHistory}
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
              <button className="ghost-button chat-detail-toggle" onClick={onOpenChatDetailDrawer}>
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
                onChange={(event) => onMessageSearchChange(event.target.value)}
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
                    onClick={onLoadOlderMessages}
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
                      <div key={message.id} id={chatMessageElementId(message.id)} className="message-item-frame">
                        {message.id === chatUnreadMessageId ? (
                          <div ref={chatUnreadAnchorRef} className="unread-message-anchor">
                            新消息
                          </div>
                        ) : null}
                        <MessageBubble
                          message={message}
                          editingDraft={editingDraft}
                          editingMessageId={editingMessageId}
                          showLearnedBadge={
                            learnedAtTimestamp !== null &&
                            new Date(message.createdAt).getTime() <= learnedAtTimestamp
                          }
                          replyLookupMessages={conversationMessages}
                          onNavigateToReply={scrollChatMessageIntoView}
                          onCancelEdit={onCancelEdit}
                          onChangeEdit={onChangeEdit}
                          onDelete={onDeleteMessage}
                          onEdit={onEditMessage}
                          onSaveEdit={onSaveEdit}
                        />
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
                  <button className="text-button danger" onClick={onRemoveAttachment}>
                    移除
                  </button>
                </div>
              </div>
            ) : null}
            <textarea
              rows={4}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={onComposerKeyDown}
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
                  onChange={onPickChatAttachment}
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
                onClick={onSendMessage}
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
        <div className="detail-drawer-backdrop" role="presentation" onMouseDown={onCloseChatDetailDrawer}>
          <aside
            className="detail-pane chat-detail-pane detail-drawer"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="detail-drawer-header">
              <h3>会话详情</h3>
              <button className="ghost-button" onClick={onCloseChatDetailDrawer}>
                关闭
              </button>
            </div>
            <ChatDetailContent
              selectedConversation={selectedConversation}
              memories={memories}
              participantLabelDraft={participantLabelDraft}
              isBusy={isBusy}
              channelName={selectedConversation ? getConversationChannelName(selectedConversation) : null}
              onParticipantLabelChange={onParticipantLabelChange}
              onSaveParticipantLabel={onSaveParticipantLabel}
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
          onParticipantLabelChange={onParticipantLabelChange}
          onSaveParticipantLabel={onSaveParticipantLabel}
        />
      </aside>
    </>
  );
}
