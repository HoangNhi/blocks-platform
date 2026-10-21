import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from "@/features/system/types/auth.types";

export const authService = {
  login: async (request: LoginRequest): Promise<ApiResponse<LoginResponse>> => {
    return api.post<LoginResponse>(API_ENDPOINTS.System.Auth.LOGIN, request);
  },
  logout: async (): Promise<void> => {
    try {
      await api.post(API_ENDPOINTS.System.Auth.LOGOUT, {});
    } catch {
      // Best-effort — don't block logout on network errors
    }
  },
  refreshToken: async (
    request: RefreshTokenRequest
  ): Promise<ApiResponse<RefreshTokenResponse>> => {
    return api.post<RefreshTokenResponse>(
      API_ENDPOINTS.System.Auth.REFRESH_TOKEN,
      request
    );
  },
};
