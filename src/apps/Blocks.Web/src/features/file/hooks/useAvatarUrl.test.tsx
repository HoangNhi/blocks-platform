import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { useAvatarUrl, extractAvatarKey } from "./useAvatarUrl";
import { fileService } from "@/features/file/api/uploadfile.api";
import { AuthContext } from "@/contexts/auth-context-definition";
import type { AuthContextType } from "@/features/system/types/auth.types";
import type { User } from "@/features/system/types/user.types";

vi.mock("@/features/file/api/uploadfile.api", () => ({
  fileService: {
    getAvatarBlob: vi.fn(),
  },
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    API_BASE_URL: "https://localhost:7213",
  };
});

describe("useAvatarUrl", () => {
  const mockUserA: User = {
    Id: "user-a",
    Username: "usera",
    Fullname: "User A",
    RoleId: "r1",
    Email: "a@test.local",
    IsActived: true,
    IsEdit: false,
  };

  const mockUserB: User = {
    Id: "user-b",
    Username: "userb",
    Fullname: "User B",
    RoleId: "r1",
    Email: "b@test.local",
    IsActived: true,
    IsEdit: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    let urlCounter = 0;
    global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++urlCounter}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  const createWrapper = (user: User | null): React.FC<{ children: React.ReactNode }> => {
    const authValue: AuthContextType = {
      user,
      systemGroup: null,
      menu: null,
      permissions: null,
      roleName: "Admin",
      loading: false,
      isAuthenticated: !!user,
      login: vi.fn(),
      logout: vi.fn(),
      getPermission: vi.fn(),
      refreshProfile: vi.fn(),
    };

    return ({ children }) => (
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    );
  };

  it("jwt_blob_becomes_object_url", async () => {
    const blob = new Blob(["fake png"], { type: "image/png" });
    vi.mocked(fileService.getAvatarBlob).mockResolvedValue(blob);

    const { result } = renderHook(
      () => useAvatarUrl("System/Avatar/11111111-1111-1111-1111-111111111111.png"),
      { wrapper: createWrapper(mockUserA) }
    );

    await waitFor(() => {
      expect(result.current).toMatch(/^blob:/);
    });

    expect(fileService.getAvatarBlob).toHaveBeenCalledWith(
      "System/Avatar/11111111-1111-1111-1111-111111111111.png",
      expect.any(AbortSignal)
    );
  });

  it("account_change_revokes_old_url", async () => {
    const blobA = new Blob(["png a"], { type: "image/png" });
    const blobB = new Blob(["png bbb"], { type: "image/png" });
    vi.mocked(fileService.getAvatarBlob)
      .mockResolvedValueOnce(blobA)
      .mockResolvedValueOnce(blobB);

    const key = "System/Avatar/11111111-1111-1111-1111-111111111111.png";
    let currentUser: User | null = mockUserA;

    const { result, rerender } = renderHook(() => useAvatarUrl(key), {
      wrapper: ({ children }) => createWrapper(currentUser)({ children }),
    });

    await waitFor(() => {
      expect(result.current).toMatch(/^blob:/);
    });

    const oldUrl = result.current;

    // Switch account
    currentUser = mockUserB;
    rerender();

    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldUrl);
    });
  });

  it("logout_aborts_pending_avatar", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(fileService.getAvatarBlob).mockImplementation((_k, signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves
    });

    const key = "System/Avatar/11111111-1111-1111-1111-111111111111.png";
    let currentUser: User | null = mockUserA;

    const { rerender } = renderHook(() => useAvatarUrl(key), {
      wrapper: ({ children }) => createWrapper(currentUser)({ children }),
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    // Logout
    currentUser = null;
    rerender();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("stale_response_after_unmount_is_ignored", async () => {
    let resolvePromise: (blob: Blob) => void;
    const pendingPromise = new Promise<Blob>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(fileService.getAvatarBlob).mockReturnValue(pendingPromise);

    const key = "System/Avatar/11111111-1111-1111-1111-111111111111.png";
    const { unmount } = renderHook(() => useAvatarUrl(key), {
      wrapper: createWrapper(mockUserA),
    });

    // Unmount while request is pending
    unmount();

    // Now resolve the promise
    const lateBlob = new Blob(["late png"], { type: "image/png" });
    resolvePromise!(lateBlob);

    // URL.createObjectURL should NOT be called for late unmounted response
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalledWith(lateBlob);
  });

  it("external_url_never_receives_bearer", async () => {
    const { result } = renderHook(
      () => useAvatarUrl("https://external.domain.com/photo.jpg"),
      { wrapper: createWrapper(mockUserA) }
    );

    // External URL passes through directly without calling getAvatarBlob
    expect(result.current).toBe("https://external.domain.com/photo.jpg");
    expect(fileService.getAvatarBlob).not.toHaveBeenCalled();
  });

  it("json_error_never_becomes_image", async () => {
    const error = new Error("Định dạng ảnh đại diện không hợp lệ");
    vi.mocked(fileService.getAvatarBlob).mockRejectedValue(error);

    const errorBlob = new Blob(['{"Success":false,"StatusCode":403}'], {
      type: "application/json",
    });

    const { result } = renderHook(
      () => useAvatarUrl("System/Avatar/11111111-1111-1111-1111-111111111111.png"),
      { wrapper: createWrapper(mockUserA) }
    );

    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });

    expect(URL.createObjectURL).not.toHaveBeenCalledWith(errorBlob);
  });

  it("normalizes_legacy_and_new_avatar_endpoints", async () => {
    const blob = new Blob(["image data"], { type: "image/png" });
    vi.mocked(fileService.getAvatarBlob).mockResolvedValue(blob);

    // Legacy URL from getFileUrl: https://localhost:7213/File/System/Avatar/<uuid>.png
    const legacyUrl = "https://localhost:7213/File/System/Avatar/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png";
    const { result: res1 } = renderHook(() => useAvatarUrl(legacyUrl), {
      wrapper: createWrapper(mockUserA),
    });

    await waitFor(() => {
      expect(res1.current).toMatch(/^blob:/);
    });

    expect(fileService.getAvatarBlob).toHaveBeenCalledWith(
      "System/Avatar/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png",
      expect.any(AbortSignal)
    );

    // New API endpoint URL: https://localhost:7213/File/api/Avatar/<uuid>.png
    const newEndpointUrl = "https://localhost:7213/File/api/Avatar/99999999-8888-7777-6666-555555555555.png";
    const { result: res2 } = renderHook(() => useAvatarUrl(newEndpointUrl), {
      wrapper: createWrapper(mockUserA),
    });

    await waitFor(() => {
      expect(res2.current).toMatch(/^blob:/);
    });

    expect(fileService.getAvatarBlob).toHaveBeenCalledWith(
      "System/Avatar/99999999-8888-7777-6666-555555555555.png",
      expect.any(AbortSignal)
    );

    // External URL with similar path should NOT be normalized or fetched with bearer
    const spoofUrl = "https://evil.com/File/api/Avatar/99999999-8888-7777-6666-555555555555.png";
    const { result: res3 } = renderHook(() => useAvatarUrl(spoofUrl), {
      wrapper: createWrapper(mockUserA),
    });

    expect(res3.current).toBe(spoofUrl);
    expect(fileService.getAvatarBlob).not.toHaveBeenCalledWith(
      spoofUrl,
      expect.any(AbortSignal)
    );
  });

  it("prevents_stale_image_during_source_switch", async () => {
    const blobA = new Blob(["avatar a"], { type: "image/png" });
    let resolveBlobB: (b: Blob) => void;
    const blobBPromise = new Promise<Blob>((resolve) => {
      resolveBlobB = resolve;
    });

    vi.mocked(fileService.getAvatarBlob)
      .mockResolvedValueOnce(blobA)
      .mockReturnValueOnce(blobBPromise);

    let key = "System/Avatar/11111111-1111-1111-1111-111111111111.png";
    const { result, rerender } = renderHook(() => useAvatarUrl(key), {
      wrapper: createWrapper(mockUserA),
    });

    await waitFor(() => {
      expect(result.current).toMatch(/^blob:/);
    });
    const urlA = result.current;

    // Switch to avatar B while it is in flight
    key = "System/Avatar/22222222-2222-2222-2222-222222222222.png";
    rerender();

    // Immediately old URL revoked and state reset to undefined (not showing stale urlA)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(urlA);
    expect(result.current).toBeUndefined();

    // Resolve B
    const blobB = new Blob(["avatar b"], { type: "image/png" });
    resolveBlobB!(blobB);

    await waitFor(() => {
      expect(result.current).toMatch(/^blob:/);
      expect(result.current).not.toBe(urlA);
    });
  });

  it("malformed_private_avatar_url_returns_undefined_never_falls_through_to_native_img", () => {
    const malformedCases = [
      "https://localhost:7213/File/api/Avatar/not-a-valid-uuid.png",
      "https://localhost:7213/File/System/Avatar/bad-format.jpg",
      "/File/api/Avatar/invalid.png",
      "/File/System/Avatar/corrupt.png",
      "System/Avatar/not-a-uuid.png",
    ];

    for (const malformed of malformedCases) {
      const { result } = renderHook(() => useAvatarUrl(malformed), {
        wrapper: createWrapper(mockUserA),
      });
      // MUST NOT return the malformed url (which would fall through to native <img src="...">)
      expect(result.current).toBeUndefined();
    }

    expect(fileService.getAvatarBlob).not.toHaveBeenCalled();
  });

  it("true_origin_mismatch_protocol_scheme_is_not_treated_as_api_origin", () => {
    // API_BASE_URL is https://localhost:7213
    // http://localhost:7213 has matching host, but origin protocol mismatch (http vs https)
    const insecureOriginUrl = "http://localhost:7213/File/api/Avatar/11111111-1111-1111-1111-111111111111.png";
    const { result } = renderHook(() => useAvatarUrl(insecureOriginUrl), {
      wrapper: createWrapper(mockUserA),
    });

    // Should NOT call getAvatarBlob with bearer credentials
    expect(fileService.getAvatarBlob).not.toHaveBeenCalled();
    // Passes through as external URL without credential fetch
    expect(result.current).toBe(insecureOriginUrl);
  });

  it("normalizes_avatar_endpoint_with_api_base_path_prefix", () => {
    const customGateway = "https://localhost:7213/gateway";
    const absoluteGatewayUrl = "https://localhost:7213/gateway/File/api/Avatar/11111111-2222-3333-4444-555555555555.png";
    const relativeGatewayUrl = "/gateway/File/System/Avatar/11111111-2222-3333-4444-555555555555.png";

    expect(extractAvatarKey(absoluteGatewayUrl, customGateway)).toBe(
      "System/Avatar/11111111-2222-3333-4444-555555555555.png"
    );
    expect(extractAvatarKey(relativeGatewayUrl, customGateway)).toBe(
      "System/Avatar/11111111-2222-3333-4444-555555555555.png"
    );
  });

  it("synchronously_clears_stale_avatar_on_account_switch_or_logout_or_source_change", async () => {
    const blobA = new Blob(["png a"], { type: "image/png" });
    vi.mocked(fileService.getAvatarBlob).mockResolvedValue(blobA);

    const keyA = "System/Avatar/11111111-1111-1111-1111-111111111111.png";
    const keyB = "System/Avatar/22222222-2222-2222-2222-222222222222.png";

    let currentUser: User | null = mockUserA;
    let currentSource: string | null = keyA;

    const renderSnapshots: (string | undefined)[] = [];

    const { rerender } = renderHook(
      () => {
        const url = useAvatarUrl(currentSource);
        renderSnapshots.push(url);
        return url;
      },
      {
        wrapper: ({ children }) => createWrapper(currentUser)({ children }),
      }
    );

    await waitFor(() => {
      expect(renderSnapshots[renderSnapshots.length - 1]).toMatch(/^blob:/);
    });

    // 1. Source change: immediate synchronous render must NOT return urlA
    renderSnapshots.length = 0;
    currentSource = keyB;
    rerender();
    expect(renderSnapshots[0]).toBeUndefined();

    // Reset back to keyA and wait for it to load
    currentSource = keyA;
    rerender();
    await waitFor(() => {
      expect(renderSnapshots[renderSnapshots.length - 1]).toMatch(/^blob:/);
    });

    // 2. Account switch: immediate synchronous render must NOT return urlA
    renderSnapshots.length = 0;
    currentUser = mockUserB;
    rerender();
    expect(renderSnapshots[0]).toBeUndefined();

    // Reset back to userA and wait for it to load
    currentUser = mockUserA;
    rerender();
    await waitFor(() => {
      expect(renderSnapshots[renderSnapshots.length - 1]).toMatch(/^blob:/);
    });

    // 3. Logout: immediate synchronous render must NOT return urlA
    renderSnapshots.length = 0;
    currentUser = null;
    rerender();
    expect(renderSnapshots[0]).toBeUndefined();
  });
});