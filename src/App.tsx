import { useEffect, useMemo, useState } from "react";
import type {
  AppDashboardSnapshot,
  AppSettings,
  ConversationMessage,
  ConversationSummary,
  MemoryEntry,
} from "./shared/contracts";

type MessageRoleFilter = "all" | "inbound" | "outbound";
type MessageSourceFilter = "all" | "telegram" | "moonchat_ai" | "moonchat_human";
type AppView = "workspace" | "settings";

const defaultSettings: AppSettings = {
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
  const [view, setView] = useState<AppView>("workspace");
  const [dashboard, setDashboard] = useState<AppDashboardSnapshot | null>(null);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageRoleFilter, setMessageRoleFilter] = useState<MessageRoleFilter>("all");
  const [messageSourceFilter, setMessageSourceFilter] = useState<MessageSourceFilter>("all");
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  const filteredConversations = useMemo(() => {
    const keyword = conversationSearch.trim().toLowerCase();
    return conversations.filter((conversation) => {
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
  }, [conversationSearch, conversations]);

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

  async function refreshWorkspace() {
    const [snapshot, conversationList] = await Promise.all([
      window.moonchat.getDashboardSnapshot(),
      window.moonchat.listConversations(),
    ]);

    setDashboard(snapshot);
    setConversations(conversationList);
    setSelectedConversationId((current) => current ?? conversationList[0]?.id ?? null);
  }

  async function refreshSettings() {
    const savedSettings = await window.moonchat.getSettings();
    setSettings(savedSettings);
    setSettingsDraft(savedSettings);
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
    await Promise.all([refreshWorkspace(), refreshSettings()]);
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

  async function handleSendMessage() {
    if (!selectedConversationId || !draft.trim()) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.sendManualMessage(selectedConversationId, draft.trim());
      setDraft("");
      await refreshWorkspace();
      await refreshMessages(selectedConversationId);
      if (selectedConversation) {
        await refreshMemories(selectedConversation);
      }
      setStatusMessage("消息已发送。");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "发送消息失败。");
    } finally {
      setIsBusy(false);
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

  async function handleSaveSettings() {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const saved = await window.moonchat.updateSettings({
        telegram: { botToken: settingsDraft.telegram.botToken.trim() },
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
      setStatusMessage("设置已保存并已重载。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存设置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="feishu-shell">
      <aside className="rail">
        <div className="brand-mark">M</div>
        <button
          className={view === "workspace" ? "rail-button active" : "rail-button"}
          onClick={() => setView("workspace")}
        >
          聊天
        </button>
        <button
          className={view === "settings" ? "rail-button active" : "rail-button"}
          onClick={() => setView("settings")}
        >
          设置
        </button>
        <div className="rail-stats">
          <span>{dashboard?.counters.conversations ?? 0}</span>
          <small>会话</small>
        </div>
      </aside>

      {view === "workspace" ? (
        <>
          <section className="session-pane">
            <header className="pane-header">
              <div>
                <h1>消息</h1>
                <p>Telegram Bot 会话</p>
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
                placeholder="搜索会话"
              />
            </div>

            <div className="session-list">
              {filteredConversations.length === 0 ? (
                <EmptyState
                  title={conversations.length === 0 ? "还没有会话" : "没有匹配的会话"}
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
                    <div className="session-title-row">
                      <strong>{conversation.title}</strong>
                      <span>{formatDateTime(conversation.updatedAt)}</span>
                    </div>
                    <p>{conversation.participantLabel ?? `用户 ${conversation.externalUserId}`}</p>
                    <div className="session-meta-row">
                      <span>{conversation.channelType}</span>
                      <span className={conversation.autoReplyEnabled ? "state-pill on" : "state-pill"}>
                        {conversation.autoReplyEnabled ? "AI开启" : "人工"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="conversation-pane">
            <header className="conversation-topbar">
              <div>
                <h2>{selectedConversation?.title ?? "选择一个会话"}</h2>
                <p>
                  {selectedConversation
                    ? `${selectedConversation.channelType} / ${
                        selectedConversation.participantLabel ?? selectedConversation.externalUserId
                      }`
                    : "在左侧选择一个会话开始处理消息"}
                </p>
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
                    onClick={async () => {
                      await window.moonchat.triggerLearning(selectedConversation.id);
                      await refreshWorkspace();
                    }}
                  >
                    学习会话
                  </button>
                </div>
              ) : null}
            </header>

            {error ? <section className="error-banner">{error}</section> : null}
            {statusMessage ? <section className="status-banner">{statusMessage}</section> : null}

            {selectedConversation ? (
              <section className="message-toolbar">
                <input
                  className="search-input"
                  value={messageSearch}
                  onChange={(event) => setMessageSearch(event.target.value)}
                  placeholder="搜索消息内容"
                />
                <div className="filter-row">
                  <label className="filter-label">
                    <span>方向</span>
                    <select
                      value={messageRoleFilter}
                      onChange={(event) =>
                        setMessageRoleFilter(event.target.value as MessageRoleFilter)
                      }
                    >
                      <option value="all">全部</option>
                      <option value="inbound">用户发来</option>
                      <option value="outbound">我方发出</option>
                    </select>
                  </label>
                  <label className="filter-label">
                    <span>来源</span>
                    <select
                      value={messageSourceFilter}
                      onChange={(event) =>
                        setMessageSourceFilter(event.target.value as MessageSourceFilter)
                      }
                    >
                      <option value="all">全部</option>
                      <option value="telegram">Telegram</option>
                      <option value="moonchat_human">人工</option>
                      <option value="moonchat_ai">AI</option>
                    </select>
                  </label>
                </div>
              </section>
            ) : null}

            <div className="message-canvas">
              {!selectedConversation ? (
                <EmptyState title="还没有打开会话" description="选择左侧会话后，在这里查看与回复消息。" />
              ) : filteredMessages.length === 0 ? (
                <EmptyState title="没有匹配的消息" description="可以清空筛选条件，或等待新消息进来。" />
              ) : (
                groupMessagesByDay(filteredMessages).map((group) => (
                  <div key={group.label} className="message-group">
                    <div className="message-group-label">{group.label}</div>
                    {group.items.map((message) => {
                      const isOutbound = message.messageRole === "outbound";
                      const isEditing = editingMessageId === message.id;
                      return (
                        <div
                          key={message.id}
                          className={isOutbound ? "chat-bubble outbound" : "chat-bubble inbound"}
                        >
                          <div className="bubble-meta">
                            <span className="meta-pill">{labelSender(message.senderType)}</span>
                            <span className="meta-pill">{describeSource(message.sourceType)}</span>
                            <span>{formatDateTime(message.createdAt)}</span>
                            {message.editedAt ? <span>已编辑</span> : null}
                          </div>

                          {isEditing ? (
                            <div className="message-edit-box">
                              <textarea
                                rows={4}
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                              />
                              <div className="message-actions">
                                <button
                                  className="ghost-button"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditingDraft("");
                                  }}
                                >
                                  取消
                                </button>
                                <button
                                  className="primary-button"
                                  onClick={() => void handleSaveEdit()}
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className={message.isDeleted ? "message-text deleted" : "message-text"}>
                                {message.contentText}
                              </p>
                              {!message.isDeleted ? (
                                <div className="message-actions">
                                  <button
                                    className="text-button"
                                    onClick={() => {
                                      setEditingMessageId(message.id);
                                      setEditingDraft(message.contentText);
                                    }}
                                  >
                                    编辑
                                  </button>
                                  <button
                                    className="text-button danger"
                                    onClick={() => void handleDeleteMessage(message.id)}
                                  >
                                    删除
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <footer className="composer">
              <textarea
                rows={4}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
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

          <aside className="detail-pane">
            <section className="detail-card">
              <h3>会话信息</h3>
              {selectedConversation ? (
                <div className="detail-list">
                  <p><span>标题</span>{selectedConversation.title}</p>
                  <p><span>渠道</span>{selectedConversation.channelType}</p>
                  <p><span>用户</span>{selectedConversation.externalUserId}</p>
                  <p><span>标签</span>{selectedConversation.participantLabel ?? "未命名"}</p>
                </div>
              ) : (
                <EmptyState title="暂无会话" description="选中后可查看基本信息。" />
              )}
            </section>

            <section className="detail-card">
              <h3>AI 状态</h3>
              <div className="detail-list">
                <p><span>自动回复</span>{selectedConversation?.autoReplyEnabled ? "开启" : "关闭"}</p>
                <p><span>模型</span>{settings.ai.model}</p>
                <p><span>提供方</span>{settings.ai.provider}</p>
              </div>
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

            <section className="detail-card">
              <h3>最近任务</h3>
              <div className="job-list compact">
                {dashboard?.latestJobs.length ? (
                  dashboard.latestJobs.map((job) => (
                    <div key={job.id} className="job-item">
                      <strong>{job.jobType}</strong>
                      <span>{job.status}</span>
                    </div>
                  ))
                ) : (
                  <EmptyState title="暂无任务" description="手动学习后会显示在这里。" />
                )}
              </div>
            </section>
          </aside>
        </>
      ) : (
        <section className="settings-layout">
          <article className="settings-panel">
            <div className="pane-header">
              <div>
                <h1>设置</h1>
                <p>管理 AI 与 Telegram 连接</p>
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
            {error ? <section className="error-banner">{error}</section> : null}
            {statusMessage ? <section className="status-banner">{statusMessage}</section> : null}
            <div className="settings-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  setSettingsDraft(settings);
                  setStatusMessage("已恢复为上次保存的配置。");
                  setError(null);
                }}
              >
                恢复
              </button>
              <button className="primary-button" onClick={() => void handleSaveSettings()}>
                保存设置
              </button>
            </div>
          </article>
        </section>
      )}
    </main>
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

function describeSource(sourceType: string) {
  if (sourceType === "telegram") return "Telegram";
  if (sourceType === "moonchat_ai") return "MoonChat AI";
  if (sourceType === "moonchat_human") return "人工工作台";
  return sourceType;
}

function labelMemoryType(memoryType: string) {
  if (memoryType === "profile") return "用户画像";
  if (memoryType === "fact") return "关键事实";
  if (memoryType === "strategy") return "沟通策略";
  if (memoryType === "summary") return "会话摘要";
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
