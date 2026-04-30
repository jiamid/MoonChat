export function ToastLayer({
  error,
  statusMessage,
  onClearError,
  onClearStatus,
}: {
  error: string | null;
  statusMessage: string | null;
  onClearError: () => void;
  onClearStatus: () => void;
}) {
  return (
    <div className="toast-layer" aria-live="polite" aria-atomic="true">
      {error ? (
        <div className="toast toast-error" role="alert">
          <div>
            <strong>操作失败</strong>
            <p>{error}</p>
          </div>
          <button className="toast-close" onClick={onClearError} aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}
      {!error && statusMessage ? (
        <div className="toast toast-success" role="status">
          <div>
            <strong>已完成</strong>
            <p>{statusMessage}</p>
          </div>
          <button className="toast-close" onClick={onClearStatus} aria-label="关闭提示">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
