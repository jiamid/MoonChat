export function MemoryEditor({
  title,
  description,
  value,
  onChange,
  onSave,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <article className="settings-panel memory-editor-panel">
      <div className="pane-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-grid memory-editor-grid">
        <label className="settings-field settings-field-wide memory-editor-field">
          <span>{title}内容</span>
          <textarea
            className="memory-editor-textarea"
            rows={14}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
      <div className="settings-actions">
        <button className="primary-button" onClick={onSave}>
          保存{title}
        </button>
      </div>
    </article>
  );
}
