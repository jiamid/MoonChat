import type { RenderAttachment } from "../../app/types";

export function MessageAttachmentPreview({ attachment }: { attachment: RenderAttachment }) {
  if (attachment.kind === "image") {
    return (
      <button
        className="bubble-image-button"
        type="button"
        onClick={() =>
          void window.moonchat.openImagePreview({
            dataUrl: attachment.dataUrl,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
          })
        }
        aria-label="打开图片预览"
        title="打开图片预览"
      >
        <img className="bubble-image" src={attachment.dataUrl} alt="消息图片" />
      </button>
    );
  }

  if (attachment.kind === "audio") {
    return (
      <div className="bubble-media-card">
        {attachment.fileName ? <span>{attachment.fileName}</span> : null}
        <audio controls src={attachment.dataUrl} />
      </div>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="bubble-media-card">
        <video controls src={attachment.dataUrl} />
        {attachment.fileName ? <span>{attachment.fileName}</span> : null}
      </div>
    );
  }

  return (
    <a className="bubble-file-card" href={attachment.dataUrl} download={attachment.fileName || "telegram-file"}>
      <span>{attachment.fileName || "文件消息"}</span>
      <small>{attachment.mimeType || "application/octet-stream"}</small>
    </a>
  );
}
