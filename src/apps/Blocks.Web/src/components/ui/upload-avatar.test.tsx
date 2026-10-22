import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import UploadAvatar, { type UploadAvatarRef } from "./upload-avatar";
import { fileService } from "@/features/file/api/uploadfile.api";

vi.mock("@/features/file/api/uploadfile.api", () => ({
  fileService: {
    uploadFile: vi.fn(),
  },
}));

describe("UploadAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:mock-avatar");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("stages_without_attachment_data", async () => {
    vi.mocked(fileService.uploadFile).mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: undefined as any,
    });

    const ref = createRef<UploadAvatarRef>();
    const { container } = render(<UploadAvatar ref={ref} />);

    const file = new File(["test"], "avatar.png", { type: "image/png" });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    const result = await ref.current?.upload();
    expect(result).toEqual({ kind: "staged", folderUpload: expect.any(String) });
    expect(fileService.uploadFile).toHaveBeenCalledTimes(1);
    expect(fileService.uploadFile).toHaveBeenCalledWith({
      files: [file],
      folderUpload: (result as any).folderUpload,
    });
  });

  it("failure_rejects", async () => {
    vi.mocked(fileService.uploadFile).mockRejectedValue(new Error("Network error"));

    const ref = createRef<UploadAvatarRef>();
    const { container } = render(<UploadAvatar ref={ref} />);

    const file = new File(["test"], "avatar.png", { type: "image/png" });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await expect(ref.current?.upload()).rejects.toThrow();
  });

  it("unchanged_and_remove_are_distinct", async () => {
    const ref = createRef<UploadAvatarRef>();
    render(<UploadAvatar ref={ref} defaultImage="System/Avatar/existing.png" />);

    // Unchanged when no interaction
    const resultUnchanged = await ref.current?.upload();
    expect(resultUnchanged).toEqual({ kind: "unchanged" });
    expect(fileService.uploadFile).not.toHaveBeenCalled();

    // Click remove button
    const removeBtn = screen.getByTitle("Xóa ảnh");
    fireEvent.click(removeBtn);

    const resultRemoved = await ref.current?.upload();
    expect(resultRemoved).toEqual({ kind: "remove" });
    expect(fileService.uploadFile).not.toHaveBeenCalled();
  });

  it("save_retry_does_not_reupload_same_selection", async () => {
    vi.mocked(fileService.uploadFile).mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: undefined as any,
    });

    const ref = createRef<UploadAvatarRef>();
    const { container } = render(<UploadAvatar ref={ref} />);

    const file = new File(["test"], "avatar.png", { type: "image/png" });
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const firstResult = await ref.current?.upload();
    expect(firstResult).toEqual({ kind: "staged", folderUpload: expect.any(String) });
    expect(fileService.uploadFile).toHaveBeenCalledTimes(1);

    // Calling upload again on the same staged selection does NOT call fileService again
    const retryResult = await ref.current?.upload();
    expect(retryResult).toEqual(firstResult);
    expect(fileService.uploadFile).toHaveBeenCalledTimes(1);
  });
});
