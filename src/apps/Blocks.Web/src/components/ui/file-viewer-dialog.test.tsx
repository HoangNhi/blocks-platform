import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FileViewerDialog from "./file-viewer-dialog";
import { fileService } from "@/features/file/api/uploadfile.api";
import { renderAsync } from "docx-preview";

vi.mock("docx-preview", () => ({
  renderAsync: vi.fn(),
}));

vi.mock("@/features/file/api/uploadfile.api", () => ({
  fileService: {
    previewFile: vi.fn(),
    previewTaskAttachment: vi.fn(),
    previewActionPlanAttachment: vi.fn(),
  },
}));

vi.mock("@/components/ui/pdf-viewer", () => ({
  PdfViewer: ({ zoom }: { zoom: number }) => (
    <div data-testid="pdf-canvas-viewer">PDF Zoom: {zoom}%</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fileService.previewFile).mockResolvedValue({
    blob: new Blob(["x"], { type: "application/octet-stream" }),
    contentType: "application/octet-stream",
  });
  vi.mocked(fileService.previewTaskAttachment).mockResolvedValue({
    blob: new Blob(["x"], { type: "application/octet-stream" }),
    contentType: "application/octet-stream",
  });
  vi.mocked(fileService.previewActionPlanAttachment).mockResolvedValue({
    blob: new Blob(["x"], { type: "application/octet-stream" }),
    contentType: "application/octet-stream",
  });
});

describe("FileViewerDialog layout", () => {
  it("uses non-scroll canvas for image", () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 1,
            FullFileName: "x.jpg",
            FileExtension: "jpg",
            FileUrl: "/x.jpg",
          } as any
        }
      />,
    );

    expect(screen.getByTestId("preview-canvas")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("preview-canvas")).not.toHaveClass(
      "overflow-auto",
    );
  });

  it("uses task attachment preview endpoint when previewContext is taskAttachment", async () => {
    vi.mocked(fileService.previewTaskAttachment).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 20,
            FullFileName: "task.jpg",
            FileExtension: "jpg",
            FileUrl: "/task.jpg",
          } as any
        }
        previewContext="taskAttachment"
      />,
    );

    expect(await screen.findByTestId("image-preview")).toBeInTheDocument();
    expect(fileService.previewTaskAttachment).toHaveBeenCalledWith(
      20,
      "internal",
    );
    expect(fileService.previewFile).not.toHaveBeenCalled();
  });

  it("uses action plan preview endpoint when previewContext is ActionPlan", async () => {
    vi.mocked(fileService.previewActionPlanAttachment).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 23,
            FullFileName: "action-plan.jpg",
            FileExtension: "jpg",
            FileUrl: "/action-plan.jpg",
          } as any
        }
        previewContext="ActionPlan"
      />,
    );

    expect(await screen.findByTestId("image-preview")).toBeInTheDocument();
    expect(fileService.previewActionPlanAttachment).toHaveBeenCalledWith(
      23,
      "internal",
    );
    expect(fileService.previewFile).not.toHaveBeenCalled();
  });

  it("uses non-scroll canvas for pdf to avoid nested scrollbars", () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 2,
            FullFileName: "x.pdf",
            FileExtension: "pdf",
            FileUrl: "/x.pdf",
          } as any
        }
      />,
    );

    expect(screen.getByTestId("preview-canvas")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("preview-canvas")).not.toHaveClass(
      "overflow-auto",
    );
  });

  it("renders dedicated pdf scroll container", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 5,
            FullFileName: "x.pdf",
            FileExtension: "pdf",
            FileUrl: "/x.pdf",
          } as any
        }
      />,
    );

    expect(await screen.findByTestId("pdf-scroll-container")).toHaveClass(
      "overflow-hidden",
    );
  });

  it("keeps pdf container within dialog viewport", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 6,
            FullFileName: "x.pdf",
            FileExtension: "pdf",
            FileUrl: "/x.pdf",
          } as any
        }
      />,
    );

    const container = await screen.findByTestId("pdf-scroll-container");
    expect(container).toHaveClass("max-h-[85vh]");
    expect(container).toHaveClass("max-w-[95vw]");
  });

  it("renders canvas-based pdf viewer instead of iframe zoom layer", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 11,
            FullFileName: "artifact.pdf",
            FileExtension: "pdf",
            FileUrl: "/artifact.pdf",
          } as any
        }
      />,
    );

    expect(await screen.findByTestId("pdf-canvas-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-zoom-layer")).not.toBeInTheDocument();
  });

  it("updates pdf zoom indicator when clicking zoom buttons", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 12,
            FullFileName: "zoom.pdf",
            FileExtension: "pdf",
            FileUrl: "/zoom.pdf",
          } as any
        }
      />,
    );

    expect(await screen.findByText("100%")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Zoom In"));
    expect(await screen.findByText("110%")).toBeInTheDocument();
  });

  it("applies zoom value to pdf iframe source", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 7,
            FullFileName: "x.pdf",
            FileExtension: "pdf",
            FileUrl: "/x.pdf",
          } as any
        }
      />,
    );

    expect(await screen.findByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Zoom In"));
    expect(await screen.findByText("110%")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Zoom Out"));
    expect(await screen.findByText("100%")).toBeInTheDocument();
  });

  it("supports ctrl+wheel zoom for pdf", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 9,
            FullFileName: "wheel.pdf",
            FileExtension: "pdf",
            FileUrl: "/wheel.pdf",
          } as any
        }
      />,
    );

    const container = await screen.findByTestId("pdf-scroll-container");
    fireEvent.wheel(container, { ctrlKey: true, deltaY: -120 });

    expect(await screen.findByText("110%")).toBeInTheDocument();
  });

  it("keeps outer pdf container non-scroll to avoid double scrollbars", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 8,
            FullFileName: "x.pdf",
            FileExtension: "pdf",
            FileUrl: "/x.pdf",
          } as any
        }
      />,
    );

    const container = await screen.findByTestId("pdf-scroll-container");
    expect(container).toHaveClass("overflow-hidden");
    expect(container).not.toHaveClass("overflow-y-auto");
  });

  it("renders video wrapper with viewport-safe max height", () => {
    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 3,
            FullFileName: "x.mp4",
            FileExtension: "mp4",
            FileUrl: "/x.mp4",
          } as any
        }
      />,
    );

    expect(screen.getByTestId("video-preview-wrapper")).toHaveClass(
      "max-h-full",
    );
  });

  it("renders image preview with viewport-safe max height", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 4,
            FullFileName: "y.jpg",
            FileExtension: "jpg",
            FileUrl: "/y.jpg",
          } as any
        }
      />,
    );

    const image = await screen.findByTestId("image-preview");
    expect(image).toHaveClass("max-h-full");
  });

  it("calls renderAsync with correct pagination options for docx files", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 21,
            FullFileName: "test.docx",
            FileExtension: "docx",
            FileUrl: "/test.docx",
          } as any
        }
      />,
    );

    await vi.waitFor(() => {
      expect(renderAsync).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.any(HTMLElement),
        undefined,
        expect.objectContaining({
          ignoreLastRenderedPageBreak: false,
          breakPages: true,
        }),
      );
    });
  });

  it("renders pdf viewer for converted docx files", async () => {
    vi.mocked(fileService.previewFile).mockResolvedValueOnce({
      blob: new Blob(["x"], { type: "application/pdf" }),
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      convertedContentType: "application/pdf",
    });

    render(
      <FileViewerDialog
        isOpen
        onClose={() => {}}
        file={
          {
            Id: 22,
            FullFileName: "BaoCao.docx",
            FileExtension: "docx",
            FileUrl: "/BaoCao.docx",
          } as any
        }
      />,
    );

    expect(await screen.findByTestId("pdf-canvas-viewer")).toBeInTheDocument();
    expect(screen.getAllByText("BaoCao.docx")).toHaveLength(2);
  });
});
