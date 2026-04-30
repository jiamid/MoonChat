import type { ConversationSummary, MemoryEntry } from "../../shared/contracts";
import { describeChannel, getConversationPreferredName, labelMemoryType } from "../../app/utils";
import { EmptyState } from "../common/EmptyState";

export function ChatDetailContent({
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
              <button className="primary-button" onClick={() => void onSaveParticipantLabel()} disabled={isBusy}>
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
