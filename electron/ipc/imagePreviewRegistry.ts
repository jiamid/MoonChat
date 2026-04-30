const previewTempFileById = new Map<string, string>();

export function registerImagePreviewTempFile(previewId: string, absolutePath: string) {
  previewTempFileById.set(previewId, absolutePath);
}

export function getImagePreviewTempPath(previewId: string): string | undefined {
  return previewTempFileById.get(previewId);
}

export function unregisterImagePreviewTempFile(previewId: string) {
  previewTempFileById.delete(previewId);
}
