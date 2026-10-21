import api, { API_BASE_URL, type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import { getAccessToken } from "@/lib/cookies";
import type { GetListPagingResponse } from "@/types/base/base.types";
import type {
  ApproveSarRequest,
  GetSarByCycleRequest,
  GetSarDraftMetadataRequest,
  SarDraft,
  SarDraftMetadata,
  SarGetListItem,
  SarGetListPagingRequest,
  SaveSarDraftRequest,
  RequestSarRevisionRequest,
  SubmitSarRequest,
  GetSarAutofillPayloadRequest,
  SarAutofillPayloadDto,
  ExportSarDocxRequest,
} from "../types/sar.types";

type SaveSarDraftResponse = null;
type SubmitSarResponse = null;
type RequestSarRevisionResponse = null;
type ApproveSarResponse = null;

export const sarService = {
  getList: async (
    request: SarGetListPagingRequest,
  ): Promise<ApiResponse<GetListPagingResponse<SarGetListItem>>> => {
    return api.post<GetListPagingResponse<SarGetListItem>>(
      API_ENDPOINTS.Business.Sar.GET_LIST,
      request,
    );
  },

  getByCycle: async (
    request: GetSarByCycleRequest,
  ): Promise<ApiResponse<SarDraft>> => {
    return api.post<SarDraft>(API_ENDPOINTS.Business.Sar.GET_BY_CYCLE, request);
  },

  saveDraft: async (
    request: SaveSarDraftRequest,
  ): Promise<ApiResponse<SaveSarDraftResponse>> => {
    return api.post<SaveSarDraftResponse>(
      API_ENDPOINTS.Business.Sar.SAVE_DRAFT,
      request,
    );
  },

  submit: async (request: SubmitSarRequest): Promise<ApiResponse<SubmitSarResponse>> => {
    return api.post<SubmitSarResponse>(API_ENDPOINTS.Business.Sar.SUBMIT, request);
  },

  requestRevision: async (
    request: RequestSarRevisionRequest,
  ): Promise<ApiResponse<RequestSarRevisionResponse>> => {
    return api.post<RequestSarRevisionResponse>(
      API_ENDPOINTS.Business.Sar.REQUEST_REVISION,
      request,
    );
  },

  approve: async (request: ApproveSarRequest): Promise<ApiResponse<ApproveSarResponse>> => {
    return api.post<ApproveSarResponse>(API_ENDPOINTS.Business.Sar.APPROVE, request);
  },

  getAutofillPayload: async (
    request: GetSarAutofillPayloadRequest,
  ): Promise<ApiResponse<SarAutofillPayloadDto>> => {
    return api.post<SarAutofillPayloadDto>(
      API_ENDPOINTS.Business.Sar.GET_AUTOFILL_PAYLOAD,
      request,
    );
  },

  getDraftMetadata: async (
    request: GetSarDraftMetadataRequest,
  ): Promise<ApiResponse<SarDraftMetadata>> => {
    return api.post<SarDraftMetadata>(
      API_ENDPOINTS.Business.Sar.GET_DRAFT_METADATA,
      request,
    );
  },

  exportDocx: async (
    request: ExportSarDocxRequest,
  ): Promise<Blob> => {
    const token = getAccessToken();
    const endpoint = new URL(
      API_ENDPOINTS.Business.Sar.EXPORT_DOCX,
      `${API_BASE_URL}/`,
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Xuất DOCX thất bại (HTTP ${response.status})`);
    }

    return response.blob();
  },
};
