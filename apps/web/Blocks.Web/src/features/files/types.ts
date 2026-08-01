export type FileAttachment = {
  id: string
  referenceType: number
  relatedId: string
  fileName: string
  fileExtension: string
  fileSize: number | null
  fileUrl: string
  fullFileName: string
}

export type UploadRequest = {
  folderName: string
  files: File[]
}

export type UploadEmbeddedRequest = UploadRequest

export type UploadTemporaryRequest = UploadRequest

export type UploadEmbeddedResult = FileAttachment[]
