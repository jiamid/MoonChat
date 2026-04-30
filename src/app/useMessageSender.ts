import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import type { ConversationMessage, ConversationSummary } from "../shared/contracts";
import type { AttachmentDraft } from "./types";
import { positionElementAfterRender } from "./utils";

export function useMessageSender({
  isAssistantView,
  activeConversation,
  selectedConversationId,
  conversations,
  draft,
  attachmentDraft,
  aiImageInputRef,
  chatImageInputRef,
  aiMessagesEndRef,
  aiComposerTextareaRef,
  setDraft,
  setAttachmentDraft,
  setMessages,
  setIsBusy,
  setError,
  setStatusMessage,
  refreshWorkspace,
  refreshMessages,
  refreshMemories,
}: {
  isAssistantView: boolean;
  activeConversation: ConversationSummary | null;
  selectedConversationId: string | null;
  conversations: ConversationSummary[];
  draft: string;
  attachmentDraft: AttachmentDraft | null;
  aiImageInputRef: RefObject<HTMLInputElement | null>;
  chatImageInputRef: RefObject<HTMLInputElement | null>;
  aiMessagesEndRef: RefObject<HTMLDivElement | null>;
  aiComposerTextareaRef: RefObject<HTMLTextAreaElement | null>;
  setDraft: Dispatch<SetStateAction<string>>;
  setAttachmentDraft: Dispatch<SetStateAction<AttachmentDraft | null>>;
  setMessages: Dispatch<SetStateAction<ConversationMessage[]>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
  refreshWorkspace: () => Promise<ConversationSummary[]>;
  refreshMessages: (conversationId: string) => Promise<void>;
  refreshMemories: (conversation: ConversationSummary) => Promise<void>;
}) {
  async function sendMessage() {
    const targetConversationId = isAssistantView ? activeConversation?.id : selectedConversationId;
    const nextText = draft.trim();
    const canSendAttachmentOnly = Boolean(attachmentDraft);
    const optimisticAttachmentDraft = attachmentDraft;
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
      const nextOptimisticMessageId = `temp-${crypto.randomUUID()}`;
      optimisticMessageId = nextOptimisticMessageId;
      setMessages((current) => [
        ...current,
        {
          id: nextOptimisticMessageId,
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
      clearAttachment(setAttachmentDraft, aiImageInputRef);
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
        clearAttachment(setAttachmentDraft, chatImageInputRef);
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
        setAttachmentDraft(optimisticAttachmentDraft);
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

  return { sendMessage };
}

function clearAttachment(
  setAttachmentDraft: Dispatch<SetStateAction<AttachmentDraft | null>>,
  inputRef: MutableRefObject<HTMLInputElement | null> | RefObject<HTMLInputElement | null>,
) {
  setAttachmentDraft(null);
  if (inputRef.current) {
    inputRef.current.value = "";
  }
}
