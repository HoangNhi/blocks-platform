export type AvatarAction = "keep" | "replace" | "remove";

export type AvatarUploadResult =
  | { kind: "unchanged" }
  | { kind: "remove" }
  | { kind: "staged"; folderUpload: string };
