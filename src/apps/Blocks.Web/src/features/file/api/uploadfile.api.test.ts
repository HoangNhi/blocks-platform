import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileService } from "./uploadfile.api";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: {
    downloadFile: vi.fn(),
  },
  api: {
    downloadFile: vi.fn(),
  },
  API_BASE_URL: "https://localhost:7213",
}));

describe("fileService.getAvatarBlob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches_valid_avatar_key_with_endpoint", async () => {
    const pngBlob = new Blob(["fake-png"], { type: "image/png" });
    vi.mocked(api.downloadFile).mockResolvedValue({
      data: pngBlob,
      status: 200,
    } as any);

    const controller = new AbortController();
    const result = await fileService.getAvatarBlob(
      "System/Avatar/11111111-2222-3333-4444-555555555555.png",
      controller.signal
    );

    expect(api.downloadFile).toHaveBeenCalledWith(
      "/File/api/Avatar/11111111-2222-3333-4444-555555555555.png",
      { signal: controller.signal, unwrapBlobErrors: true }
    );
    expect(result).toBe(pngBlob);
  });

  it("rejects_non_image_mime_type", async () => {
    const jsonBlob = new Blob(['{"Success":false}'], { type: "application/json" });
    vi.mocked(api.downloadFile).mockResolvedValue({
      data: jsonBlob,
      status: 200,
    } as any);

    await expect(
      fileService.getAvatarBlob("System/Avatar/11111111-2222-3333-4444-555555555555.png")
    ).rejects.toThrow("Định dạng ảnh đại diện không hợp lệ");
  });

  it("rejects_invalid_key_pattern_before_network", async () => {
    await expect(fileService.getAvatarBlob("invalid-key.png")).rejects.toThrow(
      "Khóa ảnh đại diện không hợp lệ"
    );
    expect(api.downloadFile).not.toHaveBeenCalled();
  });

  it("accepts_mime_type_with_parameters", async () => {
    const pngBlobWithParam = new Blob(["fake-png"], { type: "image/png; charset=utf-8" });
    vi.mocked(api.downloadFile).mockResolvedValue({
      data: pngBlobWithParam,
      status: 200,
    } as any);

    const result = await fileService.getAvatarBlob(
      "System/Avatar/11111111-2222-3333-4444-555555555555.png"
    );
    expect(api.downloadFile).toHaveBeenCalledWith(
      "/File/api/Avatar/11111111-2222-3333-4444-555555555555.png",
      { signal: undefined, unwrapBlobErrors: true }
    );
    expect(result).toBe(pngBlobWithParam);
  });
});