import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios, { type InternalAxiosRequestConfig, type AxiosResponse, type GenericAbortSignal } from "axios";
import api, { API_BASE_URL } from "./api";
import * as cookies from "./cookies";
import { API_ENDPOINTS } from "@/config";

describe("api client blob handling and refresh", () => {
  const axiosInstance = (api as any).axiosInstance;
  const originalAdapter = axiosInstance.defaults.adapter;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn();
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    axiosInstance.defaults.adapter = originalAdapter;
  });

  it("blob_403_rejects_without_image", async () => {
    const errorJson = JSON.stringify({
      Success: false,
      StatusCode: 403,
      Message: "Yêu cầu đến dịch vụ tệp tin không được phép",
    });
    const errorBlob = new Blob([errorJson], { type: "application/json" });

    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      return {
        data: errorBlob,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        config,
      };
    };

    await expect(
      api.downloadFile("/test/avatar/403", { unwrapBlobErrors: true })
    ).rejects.toThrow(
      "Yêu cầu đến dịch vụ tệp tin không được phép"
    );
    expect(URL.createObjectURL).not.toHaveBeenCalledWith(errorBlob);
  });

  it("blob_soft_401_refreshes_once", async () => {
    vi.spyOn(cookies, "getRefreshToken").mockReturnValue("existing-refresh-token");
    const saveTokensSpy = vi.spyOn(cookies, "saveTokens").mockImplementation(() => {});

    const refreshPostSpy = vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        Success: true,
        StatusCode: 200,
        Data: {
          AccessToken: "refreshed-jwt-token",
          RefreshToken: "new-refresh-token",
        },
      },
    });

    let callCount = 0;
    const finalImageBlob = new Blob(["image data"], { type: "image/png" });

    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      callCount++;
      if (callCount === 1) {
        // Soft 401: HTTP 200 with JSON error envelope in blob
        const soft401Json = JSON.stringify({
          Success: false,
          StatusCode: 401,
          Message: "Token expired",
        });
        const soft401Blob = new Blob([soft401Json], { type: "application/json" });
        return {
          data: soft401Blob,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        };
      }

      // Retry request: verify bearer token was attached
      expect(config.headers?.Authorization).toBe("Bearer refreshed-jwt-token");

      return {
        data: finalImageBlob,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "image/png" },
        config,
      };
    };

    const response = await api.downloadFile("/File/api/Avatar/test-file.png", {
      unwrapBlobErrors: true,
    });

    expect(callCount).toBe(2);
    expect(refreshPostSpy).toHaveBeenCalledTimes(1);
    expect(refreshPostSpy).toHaveBeenCalledWith(
      `${API_BASE_URL}${API_ENDPOINTS.System.Auth.REFRESH_TOKEN}`,
      { RefreshToken: "existing-refresh-token" }
    );
    expect(saveTokensSpy).toHaveBeenCalledWith("refreshed-jwt-token", "new-refresh-token");
    expect(response.data).toBe(finalImageBlob);
  });

  it("json_document_without_error_envelope_is_preserved", async () => {
    const rawJsonDoc = JSON.stringify({
      title: "Legitimate JSON Document",
      items: [1, 2, 3],
    });
    const docBlob = new Blob([rawJsonDoc], { type: "application/json" });

    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      return {
        data: docBlob,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        config,
      };
    };

    const response = await api.downloadFile("/files/doc.json");
    expect(response.data).toBe(docBlob);

    const text = await response.data.text();
    expect(JSON.parse(text)).toEqual({
      title: "Legitimate JSON Document",
      items: [1, 2, 3],
    });
  });

  it("json_document_with_missing_or_non_numeric_status_code_is_preserved", async () => {
    const nonErrorDocs = [
      JSON.stringify({ Success: false }),
      JSON.stringify({ Success: false, StatusCode: "draft" }),
    ];

    for (const rawDoc of nonErrorDocs) {
      const docBlob = new Blob([rawDoc], { type: "application/json" });
      axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        return {
          data: docBlob,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        };
      };

      const response = await api.downloadFile("/files/doc.json");
      expect(response.data).toBe(docBlob);
    }
  });

  it("generic_json_blob_shaped_like_401_or_403_is_preserved_without_refresh_or_rejection", async () => {
    const refreshPostSpy = vi.spyOn(axios, "post");
    const getRefreshTokenSpy = vi.spyOn(cookies, "getRefreshToken");

    const envelopes = [
      {
        url: "/files/legit-401.json",
        raw: JSON.stringify({
          Success: false,
          StatusCode: 401,
          Message: "Legitimate data containing 401 status",
        }),
      },
      {
        url: "/files/legit-403.json",
        raw: JSON.stringify({
          Success: false,
          StatusCode: 403,
          Message: "Legitimate data containing 403 status",
        }),
      },
    ];

    for (const item of envelopes) {
      const docBlob = new Blob([item.raw], { type: "application/json" });
      axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
        return {
          data: docBlob,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        };
      };

      const response = await api.downloadFile(item.url);
      expect(response.data).toBe(docBlob);
      const text = await response.data.text();
      expect(text).toBe(item.raw);
    }

    expect(refreshPostSpy).not.toHaveBeenCalled();
    expect(getRefreshTokenSpy).not.toHaveBeenCalled();
  });

  it("signal_survives_retry", async () => {
    vi.spyOn(cookies, "getRefreshToken").mockReturnValue("existing-refresh-token");
    vi.spyOn(cookies, "saveTokens").mockImplementation(() => {});

    vi.spyOn(axios, "post").mockResolvedValue({
      data: {
        Success: true,
        StatusCode: 200,
        Data: {
          AccessToken: "refreshed-jwt-token",
          RefreshToken: "new-refresh-token",
        },
      },
    });

    const controller = new AbortController();
    let retrySignal: GenericAbortSignal | undefined;
    let callCount = 0;

    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      callCount++;
      if (callCount === 1) {
        const soft401Json = JSON.stringify({
          Success: false,
          StatusCode: 401,
          Message: "Token expired",
        });
        const soft401Blob = new Blob([soft401Json], { type: "application/json" });
        return {
          data: soft401Blob,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        };
      }

      retrySignal = config.signal;

      return {
        data: new Blob(["retried"], { type: "image/png" }),
        status: 200,
        statusText: "OK",
        headers: { "content-type": "image/png" },
        config,
      };
    };

    await api.downloadFile("/File/api/Avatar/retry-signal.png", {
      signal: controller.signal,
      unwrapBlobErrors: true,
    });

    expect(retrySignal).toBe(controller.signal);
    expect(retrySignal?.aborted).toBe(false);

    controller.abort();
    expect(retrySignal?.aborted).toBe(true);
  });

  it("concurrent_soft_401_requests_share_refresh", async () => {
    vi.spyOn(cookies, "getRefreshToken").mockReturnValue("existing-refresh-token");
    const saveTokensSpy = vi.spyOn(cookies, "saveTokens").mockImplementation(() => {});

    let resolveRefresh!: (value: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    const refreshPostSpy = vi.spyOn(axios, "post").mockImplementation(async () => {
      return refreshPromise;
    });

    const calls: { url?: string; auth?: any }[] = [];

    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
      const auth = config.headers?.Authorization;
      calls.push({ url: config.url, auth });

      if (!auth || auth !== "Bearer refreshed-jwt-token") {
        // Soft 401 on initial call (without new token)
        return {
          data: {
            Success: false,
            StatusCode: 401,
            Message: "Token expired",
          },
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
        };
      }

      // Successful retry with refreshed token
      return {
        data: {
          Success: true,
          StatusCode: 200,
          Data: `retried-data-for-${config.url}`,
        },
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        config,
      };
    };

    // Trigger both calls simultaneously
    const promiseA = api.get<string>("/resource-a");
    const promiseB = api.get<string>("/resource-b");

    // Allow asynchronous dispatch to adapter and refresh initiation
    await new Promise((r) => setTimeout(r, 10));

    // Resolve the single refresh call
    resolveRefresh({
      data: {
        Success: true,
        StatusCode: 200,
        Data: {
          AccessToken: "refreshed-jwt-token",
          RefreshToken: "new-refresh-token",
        },
      },
    });

    const [resA, resB] = await Promise.all([promiseA, promiseB]);

    // Refresh was called exactly once
    expect(refreshPostSpy).toHaveBeenCalledTimes(1);
    expect(refreshPostSpy).toHaveBeenCalledWith(
      `${API_BASE_URL}${API_ENDPOINTS.System.Auth.REFRESH_TOKEN}`,
      { RefreshToken: "existing-refresh-token" }
    );
    expect(saveTokensSpy).toHaveBeenCalledWith("refreshed-jwt-token", "new-refresh-token");

    // Both requests resolved with retried data
    expect(resA.Data).toBe("retried-data-for-/resource-a");
    expect(resB.Data).toBe("retried-data-for-/resource-b");

    // Total 4 calls through adapter: 2 initial soft-401s, 2 retries with refreshed token
    expect(calls.length).toBe(4);
    const retryCalls = calls.filter((c) => c.auth === "Bearer refreshed-jwt-token");
    expect(retryCalls.length).toBe(2);
  });
});