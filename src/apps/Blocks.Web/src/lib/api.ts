import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
} from "axios";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  saveTokens,
} from "./cookies";
import { API_ENDPOINTS } from "@/config";

export interface ApiResponse<T = unknown> {
  Data?: T;
  Message?: string;
  Success: boolean;
  StatusCode: number;
}

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "https://localhost:7213";

class ApiClient {
  private axiosInstance: AxiosInstance;

  constructor(baseUrl: string) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Flag to track if a refresh is currently in progress
    let isRefreshing = false;
    // Queue to store requests that fail while token is being refreshed
    let failedQueue: Array<{
      resolve: (token: string) => void;
      reject: (error: any) => void;
    }> = [];

    const processQueue = (error: any, token: string | null = null) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve(token!);
        }
      });

      failedQueue = [];
    };

    // Interceptor 1: Convert "soft" 401s (HTTP 200 with StatusCode 401) to actual errors
    this.axiosInstance.interceptors.response.use(
      (response) => {
        if (response.data && response.data.StatusCode === 401) {
          const error = new AxiosError(
            response.data.Message || "Unauthorized",
            "401",
            response.config,
            response.request,
            response
          );
          if (error.response) {
            error.response.status = 401;
          }
          return Promise.reject(error);
        }
        return response;
      },
      (error) => Promise.reject(error)
    );

    // Interceptor 2: Handle refresh token logic
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const original = error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

        if (!original) return Promise.reject(error);

        // Check if the error is from the refresh token endpoint to avoid infinite loops
        if (
          error.response?.status === 401 &&
          original.url?.includes(API_ENDPOINTS.System.Auth.REFRESH_TOKEN)
        ) {
          clearTokens();
          window.location.href = "/login";
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !original._retry) {
          if (isRefreshing) {
            return new Promise<string>((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                if (original.headers) {
                  original.headers.Authorization = `Bearer ${token}`;
                }
                return this.axiosInstance(original);
              })
              .catch((err) => Promise.reject(err));
          }

          original._retry = true;
          isRefreshing = true;

          const refreshToken = getRefreshToken();

          if (refreshToken) {
            try {
              const response = await axios.post(
                `${API_BASE_URL}${API_ENDPOINTS.System.Auth.REFRESH_TOKEN}`,
                { RefreshToken: refreshToken }
              );

              const data = response.data;
              const newAccessToken =
                data.Data?.AccessToken ||
                data.accessToken ||
                data.Data?.accessToken;
              const newRefreshToken =
                data.Data?.RefreshToken ||
                data.refreshToken ||
                data.Data?.refreshToken;

              if (newAccessToken) {
                saveTokens(newAccessToken, newRefreshToken || refreshToken);

                // Process the queued requests with the new token
                processQueue(null, newAccessToken);

                if (original.headers) {
                  original.headers.Authorization = `Bearer ${newAccessToken}`;
                }
                return this.axiosInstance(original);
              } else {
                throw new Error("Failed to refresh token");
              }
            } catch (refreshError) {
              processQueue(refreshError, null);
              clearTokens();
              window.location.href = "/login";
              return Promise.reject(refreshError);
            } finally {
              isRefreshing = false;
            }
          } else {
            clearTokens();
            window.location.href = "/login";
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.get(endpoint, config);
    return response.data;
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.post(endpoint, data, config);
    return response.data;
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.put(endpoint, data, config);
    return response.data;
  }

  async delete<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.axiosInstance.delete(endpoint, config);
    return response.data;
  }

  downloadFile(url: string) {
    return this.axiosInstance.get(url, {
      responseType: "blob",
    });
  }
}

export const api = new ApiClient(API_BASE_URL);

export default api;
