import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { AttachmentDraft } from "./types";
import {
  inferAttachmentKind,
  inferMimeTypeFromFileName,
  isSupportedChatAttachment,
  readFileAsDataUrl,
} from "./utils";

export function useAttachmentDraft({
  setError,
  setStatusMessage,
}: {
  setError: Dispatch<SetStateAction<string | null>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}) {
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft | null>(null);
  const aiImageInputRef = useRef<HTMLInputElement | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);

  function clearAiAttachment() {
    setAttachmentDraft(null);
    if (aiImageInputRef.current) {
      aiImageInputRef.current.value = "";
    }
  }

  function clearChatAttachment() {
    setAttachmentDraft(null);
    if (chatImageInputRef.current) {
      chatImageInputRef.current.value = "";
    }
  }

  async function handlePickAiImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("目前只支持图片文件。");
      event.target.value = "";
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAttachmentDraft({ dataUrl, mimeType: file.type, kind: "image", fileName: file.name });
    setStatusMessage(null);
    setError(null);
  }

  async function handlePickChatAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const mimeType = file.type || inferMimeTypeFromFileName(file.name);
    const kind = inferAttachmentKind(mimeType);
    if (!isSupportedChatAttachment(file.name, mimeType)) {
      setError("目前只支持图片、音频、视频、PDF、Word、Excel 和 TXT 文件。");
      event.target.value = "";
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setAttachmentDraft({ dataUrl, mimeType, kind, fileName: file.name });
    setStatusMessage(null);
    setError(null);
  }

  return {
    attachmentDraft,
    setAttachmentDraft,
    aiImageInputRef,
    chatImageInputRef,
    clearAiAttachment,
    clearChatAttachment,
    handlePickAiImage,
    handlePickChatAttachment,
  };
}
