import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type { UploadFileRequest } from "../types/uploadfile.types";

export const fileService = {
  getAvatarBlob: async (key: string, signal?: AbortSignal): Promise<Blob> => {
    // Validate key matches System/Avatar/<uuid>.<ext>
    const cleanKey = key.trim().replace(/^\\+/, "").replace(/^\/+/, "");
    const match = cleanKey.match(
      /(?:^|\/)?System\/Avatar\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(?:png|jpg|jpeg|webp))$/i
    );
    if (!match) {
      throw new Error("Khóa ảnh đại diện không hợp lệ");
    }

    const fileName = match[1];
    const endpoint = API_ENDPOINTS.File.Avatar.GET(fileName);
    const response = await api.downloadFile(endpoint, {
      signal,
      unwrapBlobErrors: true,
    });
    const blob: Blob = response.data;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    const mimeType = blob?.type ? blob.type.split(";")[0].trim().toLowerCase() : "";
    if (!blob || !allowedTypes.includes(mimeType)) {
      throw new Error("Định dạng ảnh đại diện không hợp lệ");
    }
    return blob;
  },
  uploadFile: async (
    request: UploadFileRequest,
  ): Promise<ApiResponse<void>> => {
    const formData = new FormData();

    request.files.forEach((file) => {
      formData.append("files", file);
    });

    formData.append("FolderName", request.folderUpload);

    return api.post<void>(
      API_ENDPOINTS.File.UploadFile.POST,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 300000,
      },
    );
  },
};
