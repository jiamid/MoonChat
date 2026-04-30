import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import type { ConversationMessage } from "../../shared/contracts";
import {
  findMessageByExternalMessageId,
  formatDateTime,
  getMessageAttachment,
  getReplyReferenceTextPreview,
} from "../../app/utils";
import { MessageAttachmentPreview } from "./MessageAttachmentPreview";

export function MessageBubble({
  message,
  layout = "default",
  editingDraft,
  editingMessageId,
  showLearnedBadge = false,
  replyLookupMessages,
  onNavigateToReply,
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
  /** 用于根据 Telegram externalMessageId 解析被回复消息的摘要；不传则仅显示「回复 #id」。 */
  replyLookupMessages?: ConversationMessage[];
  onNavigateToReply?: (internalMessageId: string) => void;
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
  const visibleContentText = getVisibleContentText(message.contentText, attachment?.kind);
  const bubbleSenderBadge =
    layout === "default" && isOutbound && message.senderType === "ai_agent"
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

  const replyTarget =
    message.replyToMessageId && replyLookupMessages
      ? findMessageByExternalMessageId(replyLookupMessages, message.replyToMessageId)
      : undefined;

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
            replyLookupMessages ? (
              replyTarget && onNavigateToReply ? (
                <button
                  type="button"
                  className="reply-reference reply-reference-nav"
                  title={`跳转至消息 #${message.replyToMessageId}`}
                  onClick={() => onNavigateToReply(replyTarget.id)}
                >
                  <span className="reply-reference-label">回复</span>
                  <span className="reply-reference-snippet">{getReplyReferenceTextPreview(replyTarget)}</span>
                </button>
              ) : replyTarget ? (
                <div className="reply-reference reply-reference-static" title={`TG #${message.replyToMessageId}`}>
                  <span className="reply-reference-label">回复</span>
                  <span className="reply-reference-snippet">{getReplyReferenceTextPreview(replyTarget)}</span>
                </div>
              ) : (
                <div className="reply-reference reply-reference-miss" title={`TG #${message.replyToMessageId}`}>
                  <span className="reply-reference-label">回复 #{message.replyToMessageId}</span>
                  <span className="reply-reference-hint">（当前会话列表中尚无原文，可尝试加载更早消息）</span>
                </div>
              )
            ) : (
              <div className="reply-reference reply-reference-static">回复 #{message.replyToMessageId}</div>
            )
          ) : null}
          {attachment ? <MessageAttachmentPreview attachment={attachment} /> : null}
          {visibleContentText || !attachment ? (
            <p className={message.isDeleted ? "message-text deleted" : "message-text"}>{visibleContentText}</p>
          ) : null}
          <div className="bubble-timestamp-row" aria-label={bubbleTitle}>
            <time className="bubble-timestamp" dateTime={message.createdAt}>
              {formatDateTime(message.createdAt)}
            </time>
            {message.editedAt ? (
              <span className="bubble-edited-hint" title="已编辑">
                已编辑
              </span>
            ) : null}
          </div>
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

function getVisibleContentText(contentText: string, attachmentKind?: string) {
  const trimmedText = contentText.trim();
  const hiddenMediaLabels: Record<string, string> = {
    image: "[图片]",
    audio: "[音频]",
    video: "[视频]",
  };

  if (attachmentKind && hiddenMediaLabels[attachmentKind] === trimmedText) {
    return "";
  }

  return contentText;
}
