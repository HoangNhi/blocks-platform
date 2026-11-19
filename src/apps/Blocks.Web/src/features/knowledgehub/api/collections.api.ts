import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type {
  CollectionDto,
  CollectionPageDto,
  CollectionInput,
  CollectionListParams,
  DeleteCollectionDto,
} from "../types/collections.types";

export class CollectionApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "CollectionApiError";
  }
}

function unwrap<T>(result: ApiResponse<T>): T {
  if (!result.Success) {
    throw new CollectionApiError(
      result.StatusCode,
      result.Message || "Không thể thực hiện yêu cầu."
    );
  }
  if (result.Data == null) {
    throw new Error("Phản hồi KnowledgeHub không có dữ liệu.");
  }
  return result.Data;
}

const base = API_ENDPOINTS.KnowledgeHub.COLLECTIONS;

export const collectionsApi = {
  list: async (params: CollectionListParams, signal?: AbortSignal) =>
    unwrap<CollectionPageDto>(
      await api.get<CollectionPageDto>(base, { params, signal })
    ),
  detail: async (id: string, signal?: AbortSignal) =>
    unwrap<CollectionDto>(
      await api.get<CollectionDto>(base + "/" + encodeURIComponent(id), {
        signal,
      })
    ),
  create: async (body: CollectionInput) =>
    unwrap<CollectionDto>(await api.post<CollectionDto>(base, body)),
  update: async (id: string, body: CollectionInput) =>
    unwrap<CollectionDto>(
      await api.put<CollectionDto>(base + "/" + encodeURIComponent(id), body)
    ),
  remove: async (id: string) =>
    unwrap<DeleteCollectionDto>(
      await api.delete<DeleteCollectionDto>(base + "/" + encodeURIComponent(id))
    ),
};
