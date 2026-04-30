import type { ChangeEvent, Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import MemoryIcon from "@mui/icons-material/Memory";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StyleIcon from "@mui/icons-material/Style";
import TuneIcon from "@mui/icons-material/Tune";
import type {
  AppSettings,
  ConversationMessage,
  ConversationSummary,
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  RagProgressEvent,
} from "../shared/contracts";
import type { AiTab, AttachmentDraft } from "../app/types";
import {
  chatMessageElementId,
  scrollChatMessageIntoView,
} from "../app/utils";
import { EmptyState } from "../components/common/EmptyState";
import { KnowledgeBasePanel } from "../components/ai/KnowledgeBasePanel";
import { MemoryEditor } from "../components/ai/MemoryEditor";
import { MessageAttachmentPreview } from "../components/messages/MessageAttachmentPreview";
import { MessageBubble } from "../components/messages/MessageBubble";

type MessageGroup = {
  label: string;
  items: ConversationMessage[];
};

export function AiPage({
  aiTab,
  settingsDraft,
  hasAiHistory,
  activeConversation,
  messages,
  groupedAssistantMessages,
  loadedMessagesConversationId,
  readyAiConversationId,
  editingDraft,
  editingMessageId,
  draft,
  aiImageDraft,
  isBusy,
  baseMemoryDraft,
  styleMemoryDraft,
  knowledgeMemoryDraft,
  knowledgeDocuments,
  knowledgeEmbeddingStatus,
  knowledgeProgress,
  knowledgeSearchDraft,
  knowledgeSearchResults,
  aiMessageCanvasRef,
  aiMessagesEndRef,
  aiComposerTextareaRef,
  aiImageInputRef,
  onAiTabChange,
  onClearAiChat,
  onCancelEdit,
  onChangeEdit,
  onDeleteMessage,
  onEditMessage,
  onSaveEdit,
  onDraftChange,
  onComposerKeyDown,
  onPickAiImage,
  onRemoveAiImage,
  onSendMessage,
  onBaseMemoryDraftChange,
  onStyleMemoryDraftChange,
  onKnowledgeMemoryDraftChange,
  onSaveAiMemory,
  onImportKnowledgeFiles,
  onRefreshKnowledgeBase,
  onToggleRagTool,
  onDeleteKnowledgeDocument,
  onRebuildKnowledgeDocument,
  onOpenKnowledgeDocument,
  onKnowledgeSearchDraftChange,
  onSearchKnowledge,
  onSettingsDraftChange,
  onSaveModelSettings,
}: {
  aiTab: AiTab;
  settingsDraft: AppSettings;
  hasAiHistory: boolean;
  activeConversation: ConversationSummary | null;
  messages: ConversationMessage[];
  groupedAssistantMessages: MessageGroup[];
  loadedMessagesConversationId: string | null;
  readyAiConversationId: string | null;
  editingDraft: string;
  editingMessageId: string | null;
  draft: string;
  aiImageDraft: AttachmentDraft | null;
  isBusy: boolean;
  baseMemoryDraft: string;
  styleMemoryDraft: string;
  knowledgeMemoryDraft: string;
  knowledgeDocuments: KnowledgeDocumentSummary[];
  knowledgeEmbeddingStatus: {
    ok: boolean;
    provider: "builtin";
    model: string;
    message: string;
  } | null;
  knowledgeProgress: RagProgressEvent | null;
  knowledgeSearchDraft: string;
  knowledgeSearchResults: KnowledgeSearchResult[];
  aiMessageCanvasRef: RefObject<HTMLDivElement | null>;
  aiMessagesEndRef: RefObject<HTMLDivElement | null>;
  aiComposerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  aiImageInputRef: RefObject<HTMLInputElement | null>;
  onAiTabChange: (tab: AiTab) => void;
  onClearAiChat: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => void;
  onSaveEdit: () => Promise<void>;
  onDraftChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPickAiImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAiImage: () => void;
  onSendMessage: () => void;
  onBaseMemoryDraftChange: (value: string) => void;
  onStyleMemoryDraftChange: (value: string) => void;
  onKnowledgeMemoryDraftChange: (value: string) => void;
  onSaveAiMemory: (memoryType: "base" | "style" | "knowledge", content: string, summary: string) => void;
  onImportKnowledgeFiles: () => void;
  onRefreshKnowledgeBase: () => void;
  onToggleRagTool: (enabled: boolean) => void;
  onDeleteKnowledgeDocument: (documentId: string) => void;
  onRebuildKnowledgeDocument: (documentId: string) => void;
  onOpenKnowledgeDocument: (documentId: string) => void;
  onKnowledgeSearchDraftChange: (value: string) => void;
  onSearchKnowledge: () => void;
  onSettingsDraftChange: Dispatch<SetStateAction<AppSettings>>;
  onSaveModelSettings: () => void;
}) {
  return (
    <section className="ai-layout">
      <aside className="ai-nav">
        <header className="pane-header">
          <div>
            <h1>AI</h1>
            <p>管理对话、记忆与模型</p>
          </div>
        </header>
        <div className="ai-tab-list">
          <button className={aiTab === "assistant" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("assistant")}>
            <SmartToyIcon fontSize="small" />
            <span>AI助手</span>
          </button>
          <button className={aiTab === "base" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("base")}>
            <MemoryIcon fontSize="small" />
            <span>基础记忆</span>
          </button>
          <button className={aiTab === "style" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("style")}>
            <StyleIcon fontSize="small" />
            <span>风格记忆</span>
          </button>
          <button className={aiTab === "knowledge" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("knowledge")}>
            <MenuBookIcon fontSize="small" />
            <span>知识记忆</span>
          </button>
          <button className={aiTab === "rag" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("rag")}>
            <LibraryBooksIcon fontSize="small" />
            <span>知识库</span>
          </button>
          <button className={aiTab === "model" ? "ai-tab active" : "ai-tab"} onClick={() => onAiTabChange("model")}>
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
          <AssistantChatPanel
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
            aiMessageCanvasRef={aiMessageCanvasRef}
            aiMessagesEndRef={aiMessagesEndRef}
            aiComposerTextareaRef={aiComposerTextareaRef}
            aiImageInputRef={aiImageInputRef}
            onClearAiChat={onClearAiChat}
            onCancelEdit={onCancelEdit}
            onChangeEdit={onChangeEdit}
            onDeleteMessage={onDeleteMessage}
            onEditMessage={onEditMessage}
            onSaveEdit={onSaveEdit}
            onDraftChange={onDraftChange}
            onComposerKeyDown={onComposerKeyDown}
            onPickAiImage={onPickAiImage}
            onRemoveAiImage={onRemoveAiImage}
            onSendMessage={onSendMessage}
          />
        ) : aiTab === "base" ? (
          <MemoryEditor
            title="基础记忆"
            description="定义使用者的身份、边界、原则和长期行为约束，供 AI 助手与自动回复共用。"
            value={baseMemoryDraft}
            onChange={onBaseMemoryDraftChange}
            onSave={() => onSaveAiMemory("base", baseMemoryDraft, "Global base memory")}
          />
        ) : aiTab === "style" ? (
          <MemoryEditor
            title="风格记忆"
            description="定义使用者的说话方式、长度偏好、情绪风格、常用表达，供 AI 助手与自动回复共用。"
            value={styleMemoryDraft}
            onChange={onStyleMemoryDraftChange}
            onSave={() => onSaveAiMemory("style", styleMemoryDraft, "Global style memory")}
          />
        ) : aiTab === "knowledge" ? (
          <MemoryEditor
            title="知识记忆"
            description="沉淀使用者可复用的产品信息、FAQ、规则、业务知识和常见判断依据。"
            value={knowledgeMemoryDraft}
            onChange={onKnowledgeMemoryDraftChange}
            onSave={() => onSaveAiMemory("knowledge", knowledgeMemoryDraft, "Global knowledge memory")}
          />
        ) : aiTab === "rag" ? (
          <KnowledgeBasePanel
            documents={knowledgeDocuments}
            embeddingStatus={knowledgeEmbeddingStatus}
            ragToolEnabled={settingsDraft.ai.ragToolEnabled}
            progress={knowledgeProgress}
            searchDraft={knowledgeSearchDraft}
            searchResults={knowledgeSearchResults}
            isBusy={isBusy}
            onImport={onImportKnowledgeFiles}
            onRefresh={onRefreshKnowledgeBase}
            onToggleRagTool={onToggleRagTool}
            onDelete={onDeleteKnowledgeDocument}
            onRebuild={onRebuildKnowledgeDocument}
            onOpen={onOpenKnowledgeDocument}
            onSearchDraftChange={onKnowledgeSearchDraftChange}
            onSearch={onSearchKnowledge}
          />
        ) : (
          <ModelSettingsPanel
            settingsDraft={settingsDraft}
            onSettingsDraftChange={onSettingsDraftChange}
            onSaveModelSettings={onSaveModelSettings}
          />
        )}
      </section>
    </section>
  );
}

function AssistantChatPanel({
  hasAiHistory,
  activeConversation,
  messages,
  groupedAssistantMessages,
  loadedMessagesConversationId,
  readyAiConversationId,
  editingDraft,
  editingMessageId,
  draft,
  aiImageDraft,
  isBusy,
  aiMessageCanvasRef,
  aiMessagesEndRef,
  aiComposerTextareaRef,
  aiImageInputRef,
  onClearAiChat,
  onCancelEdit,
  onChangeEdit,
  onDeleteMessage,
  onEditMessage,
  onSaveEdit,
  onDraftChange,
  onComposerKeyDown,
  onPickAiImage,
  onRemoveAiImage,
  onSendMessage,
}: {
  hasAiHistory: boolean;
  activeConversation: ConversationSummary | null;
  messages: ConversationMessage[];
  groupedAssistantMessages: MessageGroup[];
  loadedMessagesConversationId: string | null;
  readyAiConversationId: string | null;
  editingDraft: string;
  editingMessageId: string | null;
  draft: string;
  aiImageDraft: AttachmentDraft | null;
  isBusy: boolean;
  aiMessageCanvasRef: RefObject<HTMLDivElement | null>;
  aiMessagesEndRef: RefObject<HTMLDivElement | null>;
  aiComposerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  aiImageInputRef: RefObject<HTMLInputElement | null>;
  onClearAiChat: () => void;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => void;
  onSaveEdit: () => Promise<void>;
  onDraftChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPickAiImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAiImage: () => void;
  onSendMessage: () => void;
}) {
  return (
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
              onClick={onClearAiChat}
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
                  {group.items.map((message) => (
                    <div key={message.id} id={chatMessageElementId(message.id)} className="assistant-message-frame">
                      <MessageBubble
                        message={message}
                        layout="assistant"
                        editingDraft={editingDraft}
                        editingMessageId={editingMessageId}
                        replyLookupMessages={messages}
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
      <footer className={hasAiHistory ? "assistant-composer assistant-composer-history" : "assistant-composer assistant-composer-empty"}>
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
              <button className="text-button danger" onClick={onRemoveAiImage}>
                移除
              </button>
            </div>
          </div>
        ) : null}
        <textarea
          ref={aiComposerTextareaRef}
          rows={3}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onComposerKeyDown}
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
              onChange={onPickAiImage}
            />
            <button className="ghost-button" onClick={() => aiImageInputRef.current?.click()} disabled={isBusy}>
              添加图片
            </button>
            <span>{hasAiHistory ? "对话仅保存在本地，用于管理 AI。" : "本地对话，不会同步到外部聊天渠道。"}</span>
          </div>
          <button
            className="primary-button icon-only-button assistant-send-button"
            onClick={onSendMessage}
            disabled={!activeConversation || (!draft.trim() && !aiImageDraft) || isBusy}
            aria-label="发送"
            title="发送"
          >
            <ArrowUpwardIcon fontSize="small" />
          </button>
        </div>
      </footer>
    </section>
  );
}

function ModelSettingsPanel({
  settingsDraft,
  onSettingsDraftChange,
  onSaveModelSettings,
}: {
  settingsDraft: AppSettings;
  onSettingsDraftChange: Dispatch<SetStateAction<AppSettings>>;
  onSaveModelSettings: () => void;
}) {
  return (
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
              onSettingsDraftChange((current) => ({
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
              onSettingsDraftChange((current) => ({
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
              onSettingsDraftChange((current) => ({
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
              onSettingsDraftChange((current) => ({
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
              onSettingsDraftChange((current) => ({
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
              onSettingsDraftChange((current) => ({
                ...current,
                ai: { ...current.ai, autoReplySystemPrompt: event.target.value },
              }))
            }
          />
        </label>
      </div>
      <div className="settings-actions">
        <button className="primary-button" onClick={onSaveModelSettings}>
          保存模型配置
        </button>
      </div>
    </article>
  );
}
