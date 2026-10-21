export interface UploadFileRequest {
    files: File[];
    folderUpload: string;
}

export interface Attachment {
    Id: string;
    ReferenceType: number;
    RelatedId: string;
    FileName: string;
    FileExtension: string;
    FileSize?: number;
    FileUrl: string;
    FullFileName: string;
}

export interface PreviewFileResult {
    blob: Blob;
    contentType: string;
    originalContentType?: string;
    convertedContentType?: string;
}
