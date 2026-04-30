import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import type {
  KnowledgeDocumentSummary,
  KnowledgeSearchResult,
  RagProgressEvent,
} from "../../shared/contracts";
import { formatBytes, labelKnowledgeStatus } from "../../app/utils";
import { EmptyState } from "../common/EmptyState";

export function KnowledgeBasePanel({
  documents,
  embeddingStatus,
  ragToolEnabled,
  progress,
  searchDraft,
  searchResults,
  isBusy,
  onImport,
  onRefresh,
  onToggleRagTool,
  onDelete,
  onRebuild,
  onOpen,
  onSearchDraftChange,
  onSearch,
}: {
  documents: KnowledgeDocumentSummary[];
  embeddingStatus: {
    ok: boolean;
    provider: "builtin";
    model: string;
    message: string;
  } | null;
  ragToolEnabled: boolean;
  progress: RagProgressEvent | null;
  searchDraft: string;
  searchResults: KnowledgeSearchResult[];
  isBusy: boolean;
  onImport: () => void;
  onRefresh: () => void;
  onToggleRagTool: (enabled: boolean) => void;
  onDelete: (documentId: string) => void;
  onRebuild: (documentId: string) => void;
  onOpen: (documentId: string) => void;
  onSearchDraftChange: (value: string) => void;
  onSearch: () => void;
}) {
  const progressPercent = progress?.percent ?? null;
  const progressTone = progress?.phase === "error" ? "error" : progress?.phase === "completed" ? "ok" : "active";

  return (
    <article className="settings-panel knowledge-panel">
      <div className="pane-header">
        <div>
          <h1>知识库</h1>
          <p>独立于 AI 记忆的 RAG 文档库，当前支持 txt / md 文本导入。</p>
        </div>
        <div className="header-actions">
          <button
            className="rag-tool-switch"
            data-mode={ragToolEnabled ? "enabled" : "disabled"}
            onClick={() => onToggleRagTool(!ragToolEnabled)}
            disabled={isBusy}
            aria-label={ragToolEnabled ? "关闭 AI 调用知识库工具" : "开启 AI 调用知识库工具"}
            aria-pressed={ragToolEnabled}
            title={ragToolEnabled ? "AI 可按需调用知识库" : "AI 不会看到知识库工具"}
          >
            <span className="rag-tool-switch-thumb" aria-hidden="true" />
            <span className="rag-tool-switch-option rag-tool-switch-option-off" aria-hidden="true">
              关
            </span>
            <span className="rag-tool-switch-option rag-tool-switch-option-on" aria-hidden="true">
              开
            </span>
          </button>
          <button
            className="ghost-button icon-only-button"
            onClick={onRefresh}
            disabled={isBusy}
            aria-label="刷新知识库状态"
            title="刷新知识库列表、索引进度和 embedding 状态"
          >
            <RefreshIcon fontSize="small" />
          </button>
          <button className="primary-button icon-text-button" onClick={onImport} disabled={isBusy}>
            <AddIcon fontSize="small" />
            导入文档
          </button>
        </div>
      </div>

      <div className={embeddingStatus?.ok ? "rag-status-card ok" : "rag-status-card warning"}>
        <strong>{embeddingStatus?.model ?? "Xenova/multilingual-e5-small"}</strong>
        <span>{embeddingStatus?.message ?? "正在读取内置 embedding 状态。"}</span>
      </div>

      <div className={`rag-progress-card ${progressTone}`}>
        <div className="rag-progress-top">
          <strong>{progress?.message ?? "暂无索引任务"}</strong>
          {progressPercent !== null ? <span>{Math.round(progressPercent)}%</span> : null}
        </div>
        {progressPercent !== null ? (
          <div className="rag-progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
          </div>
        ) : null}
        <div className="rag-progress-meta">
          {progress?.documentTitle ? <span>{progress.documentTitle}</span> : null}
          {progress?.chunkIndex && progress.totalChunks ? (
            <span>
              {progress.chunkIndex}/{progress.totalChunks} chunks
            </span>
          ) : null}
          {progress?.file ? <span>{progress.file}</span> : null}
          {progress?.loaded && progress.total ? (
            <span>
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </span>
          ) : null}
        </div>
        {progress?.error ? <p className="rag-progress-error">{progress.error}</p> : null}
      </div>

      <section className="rag-search-panel">
        <div className="list-toolbar">
          <input
            className="search-input"
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="测试知识库检索"
          />
          <button className="ghost-button" onClick={onSearch} disabled={isBusy || !searchDraft.trim()}>
            搜索
          </button>
        </div>
        {searchResults.length ? (
          <div className="rag-result-stack">
            {searchResults.map((result) => (
              <div key={result.chunkId} className="rag-result-card">
                <div className="memory-card-top">
                  <strong>{result.documentTitle}</strong>
                  <span>{result.matchType} {result.score.toFixed(2)}</span>
                </div>
                <p>{result.content}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {documents.length ? (
        <div className="knowledge-document-stack">
          {documents.map((document) => (
            <div className="knowledge-document-row" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <p>{document.sourcePath ?? "手动文档"}</p>
                {document.lastError ? <small>{document.lastError}</small> : null}
              </div>
              <span className={`knowledge-status ${document.status}`}>
                {labelKnowledgeStatus(document.status)}
              </span>
              <span>{document.chunkCount} chunks</span>
              <button
                className="ghost-button icon-only-button"
                onClick={() => onOpen(document.id)}
                disabled={isBusy || !document.sourcePath}
                aria-label="打开知识文档"
                title={document.sourcePath ? "打开原文档" : "没有可打开的本地文件"}
              >
                <OpenInNewIcon fontSize="small" />
              </button>
              <button
                className="ghost-button icon-only-button"
                onClick={() => onRebuild(document.id)}
                disabled={isBusy}
                aria-label="重建索引"
                title="重建索引"
              >
                <RefreshIcon fontSize="small" />
              </button>
              <button
                className="ghost-button icon-only-button subtle-danger"
                onClick={() => onDelete(document.id)}
                disabled={isBusy}
                aria-label="删除知识文档"
                title="删除"
              >
                <DeleteIcon fontSize="small" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="暂无知识文档" description="导入 txt 或 md 后，AI 会在回答前检索这些资料。" />
      )}
    </article>
  );
}
