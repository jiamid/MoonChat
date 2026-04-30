import { useState, type Dispatch, type SetStateAction } from "react";
import type { ConversationSummary } from "../shared/contracts";

export function useMessageEditing({
  selectedConversationId,
  selectedConversation,
  refreshWorkspace,
  refreshMessages,
  refreshMemories,
  setIsBusy,
  setError,
  setStatusMessage,
}: {
  selectedConversationId: string | null;
  selectedConversation: ConversationSummary | null;
  refreshWorkspace: () => Promise<unknown>;
  refreshMessages: (conversationId: string) => Promise<void>;
  refreshMemories: (conversation: ConversationSummary) => Promise<void>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");

  function cancelEdit() {
    setEditingMessageId(null);
    setEditingDraft("");
  }

  function startEdit(messageId: string, text: string) {
    setEditingMessageId(messageId);
    setEditingDraft(text);
  }

  async function saveEdit() {
    if (!editingMessageId || !editingDraft.trim() || !selectedConversationId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.updateMessage(editingMessageId, editingDraft.trim());
      cancelEdit();
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

  async function deleteMessage(messageId: string) {
    if (!selectedConversationId) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await window.moonchat.deleteMessage(messageId);
      if (editingMessageId === messageId) {
        cancelEdit();
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

  return {
    editingMessageId,
    editingDraft,
    setEditingDraft,
    cancelEdit,
    startEdit,
    saveEdit,
    deleteMessage,
  };
}
