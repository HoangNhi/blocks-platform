import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type { GetListPagingResponse } from "@/types/base/base.types";
import type {
  AddExternalReviewAccountsRequest,
  AddExternalReviewFindingRequest,
  ConfirmExternalReviewCompletionRequest,
  CreateAndLinkExternalReviewAccountRequest,
  CreateExternalReviewRequest,
  DeleteExternalReviewFindingRequest,
  ExternalReviewAccount,
  ExternalReviewAccountGetListRequest,
  ExternalReviewAccountGetListResponse,
  ExternalReviewAccountUpdateRequest,
  ExternalReviewDetail,
  ExternalReviewFinding,
  ExternalReviewGetListRequest,
  ExternalReviewListItem,
  ExternalReviewResult,
  GetExternalReviewAccountsRequest,
  GetExternalReviewRequest,
  RemoveExternalReviewAccountRequest,
  UpdateExternalReviewFindingRequest,
  UpdateExternalReviewStatusRequest,
  UpdateExternalReviewWatermarkRequest,
  UpsertExternalReviewResultRequest,
} from "../types/externalReview.types";

export const externalReviewService = {
  getList: async (
    request: ExternalReviewGetListRequest,
  ): Promise<ApiResponse<GetListPagingResponse<ExternalReviewListItem>>> => {
    return api.get<GetListPagingResponse<ExternalReviewListItem>>(
      API_ENDPOINTS.Business.ExternalReview.GET_LIST,
      {
        params: {
          pageIndex: request.PageIndex,
          pageSize: request.PageSize,
          textSearch: request.TextSearch,
          status: request.Status,
          cycleId: request.CycleId,
        },
      },
    );
  },

  create: async (
    request: CreateExternalReviewRequest,
  ): Promise<ApiResponse<ExternalReviewDetail>> => {
    return api.post<ExternalReviewDetail>(
      API_ENDPOINTS.Business.ExternalReview.CREATE,
      request,
    );
  },

  get: async (
    request: GetExternalReviewRequest,
  ): Promise<ApiResponse<ExternalReviewDetail>> => {
    return api.get<ExternalReviewDetail>(
      API_ENDPOINTS.Business.ExternalReview.GET_BY_CYCLE,
      {
        params: { cycleId: request.CycleId },
      },
    );
  },

  updateStatus: async (
    request: UpdateExternalReviewStatusRequest,
  ): Promise<ApiResponse<ExternalReviewDetail>> => {
    return api.put<ExternalReviewDetail>(
      API_ENDPOINTS.Business.ExternalReview.UPDATE_STATUS,
      {
        Id: request.ExternalReviewId,
        Status: request.Status,
      },
    );
  },

  updateWatermark: async (
    request: UpdateExternalReviewWatermarkRequest,
  ): Promise<ApiResponse<ExternalReviewDetail>> => {
    return api.put<ExternalReviewDetail>(
      API_ENDPOINTS.Business.ExternalReview.UPDATE_WATERMARK,
      {
        Id: request.ExternalReviewId,
        WatermarkText: request.WatermarkText,
        WatermarkOpacity: request.WatermarkOpacity,
        WatermarkPosition: request.WatermarkPosition,
      },
    );
  },

  confirmCompletion: async (
    request: ConfirmExternalReviewCompletionRequest,
  ): Promise<ApiResponse<ExternalReviewDetail>> => {
    return api.post<ExternalReviewDetail>(
      API_ENDPOINTS.Business.ExternalReview.CONFIRM_COMPLETION(
        request.ExternalReviewId,
      ),
    );
  },

  upsertResult: async (
    request: UpsertExternalReviewResultRequest,
  ): Promise<ApiResponse<ExternalReviewResult>> => {
    return api.post<ExternalReviewResult>(
      API_ENDPOINTS.Business.ExternalReview.UPSERT_RESULT,
      request,
    );
  },

  addFinding: async (
    request: AddExternalReviewFindingRequest,
  ): Promise<ApiResponse<ExternalReviewFinding>> => {
    return api.post<ExternalReviewFinding>(
      API_ENDPOINTS.Business.ExternalReview.ADD_FINDING,
      request,
    );
  },

  updateFinding: async (
    request: UpdateExternalReviewFindingRequest,
  ): Promise<ApiResponse<ExternalReviewFinding>> => {
    return api.put<ExternalReviewFinding>(
      API_ENDPOINTS.Business.ExternalReview.UPDATE_FINDING,
      {
        Id: request.FindingId,
        FindingType: request.FindingType,
        Content: request.Content,
        CriterionId: request.CriterionId,
      },
    );
  },

  deleteFinding: async (
    request: DeleteExternalReviewFindingRequest,
  ): Promise<ApiResponse<null>> => {
    return api.delete<null>(
      API_ENDPOINTS.Business.ExternalReview.DELETE_FINDING(request.FindingId),
    );
  },

  getAccounts: async (
    request: GetExternalReviewAccountsRequest,
  ): Promise<ApiResponse<ExternalReviewAccount[]>> => {
    return api.get<ExternalReviewAccount[]>(
      API_ENDPOINTS.Business.ExternalReview.GET_ACCOUNTS(request.ExternalReviewId),
    );
  },

  getAccountsList: async (
    request: ExternalReviewAccountGetListRequest,
  ): Promise<ApiResponse<ExternalReviewAccountGetListResponse>> => {
    return api.post<ExternalReviewAccountGetListResponse>(
      API_ENDPOINTS.Business.ExternalReview.GET_ACCOUNTS_LIST,
      request,
    );
  },

  addAccounts: async (
    request: AddExternalReviewAccountsRequest,
  ): Promise<ApiResponse<ExternalReviewAccount[]>> => {
    const created: ExternalReviewAccount[] = [];

    for (const userId of request.UserIds) {
      const response = await api.post<ExternalReviewAccount>(
        API_ENDPOINTS.Business.ExternalReview.ADD_ACCOUNT(request.ExternalReviewId),
        {
          UserId: userId,
        },
      );

      if (!response.Success) {
        throw new Error(response.Message || "Không thể thêm tài khoản.");
      }

      if (response.Data) {
        created.push(response.Data);
      }
    }

    return {
      Data: created,
      Message: "",
      Success: true,
      StatusCode: 200,
    };
  },

  createAndLinkAccount: async (
    request: CreateAndLinkExternalReviewAccountRequest,
  ): Promise<ApiResponse<ExternalReviewAccount>> => {
    return api.post<ExternalReviewAccount>(
      API_ENDPOINTS.Business.ExternalReview.CREATE_AND_LINK_ACCOUNT(request.ExternalReviewId),
      {
        Fullname: request.Fullname,
        Username: request.Username,
        Email: request.Email,
        Password: request.Password,
      },
    );
  },

  updateAccount: async (
    request: ExternalReviewAccountUpdateRequest,
  ): Promise<ApiResponse<ExternalReviewAccount>> => {
    return api.put<ExternalReviewAccount>(
      API_ENDPOINTS.Business.ExternalReview.UPDATE_ACCOUNT(request.AccountId),
      {
        Fullname: request.Fullname,
        Username: request.Username,
        Email: request.Email,
        IsActived: request.IsActived,
        Password: request.Password,
      },
    );
  },

  removeAccount: async (
    request: RemoveExternalReviewAccountRequest,
  ): Promise<ApiResponse<null>> => {
    return api.delete<null>(
      API_ENDPOINTS.Business.ExternalReview.REMOVE_ACCOUNT(request.AccountId),
    );
  },
};
