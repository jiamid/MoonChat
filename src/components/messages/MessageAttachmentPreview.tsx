import type { RenderAttachment } from "../../app/types";

export function MessageAttachmentPreview({ attachment }: { attachment: RenderAttachment }) {
  if (attachment.kind === "image") {
    return <img className="bubble-image" src={attachment.dataUrl} alt="消息图片" />;
  }

  if (attachment.kind === "audio") {
    return (
      <div className="bubble-media-card">
        <span>{attachment.fileName || "音频消息"}</span>
        <audio controls src={attachment.dataUrl} />
      </div>
    );
  }

  if (attachment.kind === "video") {
    return (
      <div className="bubble-media-card">
        <video controls src={attachment.dataUrl} />
        <span>{attachment.fileName || "视频消息"}</span>
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
