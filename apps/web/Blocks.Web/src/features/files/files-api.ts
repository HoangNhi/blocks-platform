import type { ApiClient } from "@/lib/api/client"

import type {
  FileAttachment,
  UploadEmbeddedRequest,
  UploadEmbeddedResult,
  UploadTemporaryRequest,
} from "./types"

type FilesApiOptions = Pick<ApiClient, "request">
type ApiRecord = Record<string, unknown>

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {}
}

function pick(record: ApiRecord, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key]
  }

  return undefined
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function validateUploadRequest(request: UploadEmbeddedRequest) {
  const folderName = request.folderName.trim()

  if (!folderName) {
    throw new Error("Folder name is required.")
  }

  if (
    folderName.includes("..") ||
    folderName.includes("/") ||
    folderName.includes("\\")
  ) {
    throw new Error("Folder name cannot contain path traversal or separators.")
  }

  if (request.files.length === 0) {
    throw new Error("At least one file is required.")
  }

  return folderName
}

function buildUploadFormData(request: UploadEmbeddedRequest) {
  const folderName = validateUploadRequest(request)
  const formData = new FormData()

  formData.append("FolderName", folderName)
  for (const file of request.files) {
    formData.append("files", file)
  }

  return formData
}

export function normalizeFileAttachment(row: unknown): FileAttachment {
  const record = asRecord(row)

  return {
    id: text(pick(record, "id", "Id")),
    referenceType: numberValue(pick(record, "referenceType", "ReferenceType")),
    relatedId: text(pick(record, "relatedId", "RelatedId")),
    fileName: text(pick(record, "fileName", "FileName")),
    fileExtension: text(pick(record, "fileExtension", "FileExtension")),
    fileSize: nullableNumber(pick(record, "fileSize", "FileSize")),
    fileUrl: text(pick(record, "fileUrl", "FileUrl")),
    fullFileName: text(pick(record, "fullFileName", "FullFileName")),
  }
}

export function normalizeFileAttachments(payload: unknown): UploadEmbeddedResult {
  if (!Array.isArray(payload)) return []

  return payload.map(normalizeFileAttachment)
}

export function createFilesApi(client: FilesApiOptions) {
  return {
    uploadEmbedded: async (request: UploadEmbeddedRequest) =>
      normalizeFileAttachments(
        await client.request<unknown>("/api/files/UploadFile/embed", {
          method: "POST",
          body: buildUploadFormData(request),
        }),
      ),
    uploadTemporary: async (request: UploadTemporaryRequest) => {
      await client.request<unknown>("/api/files/UploadFile", {
        method: "POST",
        body: buildUploadFormData(request),
      })
    },
  }
}
