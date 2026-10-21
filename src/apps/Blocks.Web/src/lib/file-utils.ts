export type FileViewerType = "pdf" | "image" | "video" | "office" | "unknown";

export function getFileViewerType(
  fileNameOrExtension?: string,
): FileViewerType {
  if (!fileNameOrExtension) return "unknown";

  const normalized = fileNameOrExtension.toLowerCase();
  const extension = normalized.includes(".")
    ? (normalized.split(".").pop() ?? "")
    : normalized.replace(".", "");

  if (["pdf"].includes(extension)) return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension))
    return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(extension)) return "video";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension))
    return "office";

  return "unknown";
}
