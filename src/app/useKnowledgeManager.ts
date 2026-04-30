import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AppSettings,
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  RagProgressEvent,
} from "../shared/contracts";
import { findMemoryContent } from "./utils";

export function useKnowledgeManager({
  settings,
  settingsDraft,
  setSettings,
  setSettingsDraft,
  setIsBusy,
  setError,
  setStatusMessage,
  refreshWorkspace,
}: {
  settings: AppSettings;
  settingsDraft: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
  refreshWorkspace: () => Promise<unknown>;
}) {
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

  useEffect(() => {
    const unsubscribe = window.moonchat.onKnowledgeProgress((payload) => {
      setKnowledgeProgress(payload);
    });
    return unsubscribe;
  }, []);

  async function refreshGlobalAiMemories() {
    const items = await window.moonchat.getGlobalAiMemories();
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

  return {
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
  };
}
