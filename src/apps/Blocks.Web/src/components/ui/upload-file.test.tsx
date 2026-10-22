import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UploadFile from "./upload-file";
import { fileService } from "@/features/file/api/uploadfile.api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./file-viewer-dialog", () => ({
  default: () => null,
}));

vi.mock("@/features/file/api/uploadfile.api", () => ({
  fileService: {
    uploadFile: vi.fn(),
    previewFile: vi.fn(),
    previewTaskAttachment: vi.fn(),
    previewActionPlanAttachment: vi.fn(),
  },
}));

describe("UploadFile filename display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("keeps full filename in title for uploaded and selected files", () => {
    const uploadedName =
      "very-very-long-uploaded-file-name-that-should-be-truncated-in-the-row-layout.pdf";
    const selectedName =
      "very-very-long-selected-file-name-that-should-be-truncated-in-the-row-layout.pdf";

    const { container } = render(
      <UploadFile
        listAttachment={
          [
            {
              Id: "1",
              FullFileName: uploadedName,
              FileUrl: "/files/1",
            },
          ] as any
        }
      />,
    );

    expect(screen.getByText(uploadedName)).toHaveAttribute("title", uploadedName);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["file-data"], selectedName, { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText(selectedName)).toHaveAttribute("title", selectedName);
  });

  it("private_download_does_not_fetch_static_path", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["dummy-pdf-content"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    const fetchSpy = vi.spyOn(global, "fetch");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);

    render(
      <UploadFile
        listAttachment={[
          {
            Id: "att-private-1",
            FullFileName: "private-evidence.pdf",
            FileUrl: "/File/System/Attachments/private-evidence.pdf",
          } as any,
        ]}
      />,
    );

    const downloadBtn = screen.getByTitle("Tải xuống");
    fireEvent.click(downloadBtn);

    await vi.waitFor(() => {
      expect(fileService.previewFile).toHaveBeenCalledWith("att-private-1", "internal");
    });
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/File/System/Attachments/"),
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("download_failure_does_not_open_static_fallback", async () => {
    vi.mocked(fileService.previewFile).mockRejectedValueOnce(
      new Error("Preview service down"),
    );

    const fetchSpy = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Static fail"));
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null as any);

    render(
      <UploadFile
        listAttachment={[
          {
            Id: "att-fail-1",
            FullFileName: "error-file.pdf",
            FileUrl: "/File/System/Attachments/error-file.pdf",
          } as any,
        ]}
      />,
    );

    const downloadBtn = screen.getByTitle("Tải xuống");
    fireEvent.click(downloadBtn);

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Không thể tải tệp xuống/i),
      );
    });
    expect(openSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/File/System/Attachments/"),
    );
  });
});