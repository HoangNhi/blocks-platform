import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, XIcon } from "lucide-react";

import { fileService } from "@/features/file/api/uploadfile.api";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { getFileViewerType, type FileViewerType } from "@/lib/file-utils";
import { cn, getFileUrl } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog } from "@/components/ui/dialog";
import {
  FileText,
  Image as ImageIcon,
  Film,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  File,
} from "lucide-react";

import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import { ExcelViewer } from "@/components/ui/excel-viewer";
import { PdfViewer } from "@/components/ui/pdf-viewer";

const XLSX_PREVIEW_MAX_ROWS = 100;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

interface FileViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: Attachment | null;
  mode?: "internal" | "external";
  allowDownload?: boolean;
  previewContext?: "evidence" | "taskAttachment" | "ActionPlan";
}

function getFileIcon(type: string, className = "size-5") {
  switch (type) {
    case "excel":
      return <FileSpreadsheet className={`${className} text-emerald-500`} />;
    case "word":
      return <FileText className={`${className} text-blue-500`} />;
    case "pdf":
      return <FileText className={`${className} text-rose-500`} />;
    case "video":
      return <Film className={`${className} text-purple-500`} />;
    case "image":
      return <ImageIcon className={`${className} text-amber-500`} />;
    default:
      return <File className={`${className} text-slate-400`} />;
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}

function getFileViewerTypeFromContentType(
  contentType?: string,
): "pdf" | "image" | "video" | null {
  if (!contentType) return null;

  const normalized = contentType.toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";

  return null;
}

const FileViewerDialog = ({
  isOpen,
  onClose,
  file,
  mode = "internal",
  allowDownload = true,
  previewContext = "evidence",
}: FileViewerDialogProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [officeBlob, setOfficeBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [previewViewerType, setPreviewViewerType] =
    useState<FileViewerType | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const officeContainerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const increaseZoom = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const decreaseZoom = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  const resetZoom = () => setZoom(100);

  // Reset zoom when file changes
  useEffect(() => {
    setZoom(100);
  }, [file]);

  useEffect(() => {
    if (isOpen) return;

    setOfficeBlob(null);
    setWorkbook(null);
    setActiveSheet("");

    if (officeContainerRef.current) {
      officeContainerRef.current.innerHTML = "";
    }
  }, [isOpen]);

  const fileExt =
    file?.FileExtension || file?.FullFileName?.split(".").pop()?.toLowerCase();

  const defaultViewerType = useMemo(
    () => getFileViewerType(fileExt || ""),
    [fileExt],
  );
  const previewFile =
    previewContext === "taskAttachment"
      ? fileService.previewTaskAttachment
      : previewContext === "ActionPlan"
        ? fileService.previewActionPlanAttachment
        : fileService.previewFile;
  const viewerType = useMemo(
    () => previewViewerType ?? defaultViewerType,
    [defaultViewerType, previewViewerType],
  );
  const shouldUseScrollableCanvas = false;

  // Global wheel listener for Ctrl + Scroll zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      // Intercept Ctrl + Scroll
      if (e.ctrlKey) {
        e.preventDefault(); // Prevent browser page zoom

        // Zoom the preview content if supported
        if (["office", "image", "pdf"].includes(viewerType)) {
          if (e.deltaY < 0) {
            setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
          } else {
            setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
          }
        }
      }
    };

    // Use { passive: false } so preventDefault() works to override browser zoom
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen, viewerType]);

  useEffect(() => {
    if (!isOpen || !file) return;

    let isCancelled = false;

    const loadPreview = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setOfficeBlob(null);
      setWorkbook(null);
      setActiveSheet("");
      setPreviewViewerType(null);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(null);

      try {
        if (defaultViewerType === "video") {
          const directUrl = getFileUrl(file.FileUrl);
          if (!directUrl) {
            throw new Error("Invalid file url");
          }

          if (isCancelled) return;
          setBlobUrl(directUrl);
          return;
        }

        const preview = await previewFile(file.Id, mode);
        if (isCancelled) return;

        const effectiveContentType =
          preview.convertedContentType ??
          preview.contentType ??
          preview.blob.type;
        const resolvedViewerType =
          getFileViewerTypeFromContentType(effectiveContentType) ??
          defaultViewerType;

        setPreviewViewerType(resolvedViewerType);

        if (resolvedViewerType === "office") {
          setOfficeBlob(preview.blob);
          return;
        }

        const url = URL.createObjectURL(preview.blob);
        objectUrlRef.current = url;
        setBlobUrl(url);
      } catch {
        if (!isCancelled) {
          setErrorMessage("Không thể tải dữ liệu xem trước.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      isCancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [file, isOpen, mode, defaultViewerType, previewFile]);

  useEffect(() => {
    if (viewerType === "office" && officeBlob) {
      const extension = fileExt?.replace(".", "") || "";

      const renderOfficeFile = async () => {
        setIsLoading(true);
        try {
          if (["docx", "doc"].includes(extension)) {
            // Render docx — needs the DOM ref to be mounted
            if (!officeContainerRef.current) return;
            await renderAsync(
              officeBlob,
              officeContainerRef.current as HTMLElement,
              undefined,
              {
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
                ignoreLastRenderedPageBreak: false,
                breakPages: true,
              },
            );

            // Post-process to physically split the DOM into separate sections for visual pagination
            const wrapper =
              officeContainerRef.current.querySelector(".docx-wrapper");
            if (wrapper) {
              const sections = Array.from(
                wrapper.querySelectorAll("section.docx"),
              );

              sections.forEach((section) => {
                let currentSection = section;
                const children = Array.from(section.children);

                children.forEach((child) => {
                  if (child instanceof HTMLElement) {
                    // docx-preview adds page-break-before to paragraphs or inserts <br style="page-break-before...">
                    const style = child.getAttribute("style") || "";
                    const hasPageBreak =
                      style.includes("page-break-before: always") ||
                      style.includes("break-before: page") ||
                      child.querySelector(
                        '[style*="page-break-before: always"]',
                      ) !== null ||
                      child.querySelector('[style*="break-before: page"]') !==
                        null;

                    if (hasPageBreak && currentSection.children.length > 0) {
                      // Create a new visual page container
                      const newSection = document.createElement("section");
                      newSection.className = section.className;
                      Array.from(section.attributes).forEach((attr) => {
                        if (attr.name !== "style") {
                          newSection.setAttribute(attr.name, attr.value);
                        }
                      });
                      newSection.setAttribute(
                        "style",
                        section.getAttribute("style") || "",
                      );

                      // Strip break styling so it doesn't cause layout issues in the new physical block
                      if (
                        style.includes("page-break-before") ||
                        style.includes("break-before")
                      ) {
                        child.style.pageBreakBefore = "auto";
                        child.style.breakBefore = "auto";
                      }

                      // Insert the new page section
                      currentSection.parentNode?.insertBefore(
                        newSection,
                        currentSection.nextSibling,
                      );
                      currentSection = newSection;
                    }
                  }
                  currentSection.appendChild(child);
                });
              });
            }
          } else if (["xlsx", "xls"].includes(extension)) {
            // Parse xlsx — does NOT need a DOM ref
            const buffer = await officeBlob.arrayBuffer();
            const wb = XLSX.read(buffer, {
              type: "array",
              sheetRows: XLSX_PREVIEW_MAX_ROWS,
            });
            setWorkbook(wb);
            setActiveSheet(wb.SheetNames[0]);
            setOfficeBlob(null);
          } else {
            if (officeContainerRef.current) {
              officeContainerRef.current.innerHTML = `
                <div class="h-full w-full flex items-center justify-center text-center px-8 text-sm text-gray-600">
                  Định dạng Office này chưa hỗ trợ xem trực tiếp. Vui lòng tải tệp xuống để xem nội dung.
                </div>
              `;
            }
          }
        } catch (error) {
          console.error("Office Preview Error", error);
          if (officeContainerRef.current) {
            officeContainerRef.current.innerHTML = `
              <div class="h-full w-full flex items-center justify-center text-center px-8 text-sm text-red-500">
                Lỗi khi hiển thị dữ liệu xem trước Office.
              </div>
            `;
          }
        } finally {
          setIsLoading(false);
        }
      };

      renderOfficeFile();
    }
  }, [officeBlob, viewerType, fileExt]);

  const handleDownload = async () => {
    if (!file) return;

    try {
      if (viewerType === "video") {
        const directUrl = getFileUrl(file.FileUrl);
        if (!directUrl) throw new Error("Invalid file url");

        const link = document.createElement("a");
        link.href = directUrl;
        link.download = file.FullFileName || "download";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }

      // If we already fetched the blob, use the blob url
      if (blobUrl) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = file.FullFileName || "download";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }

      const preview = await previewFile(file.Id, mode);
      const downloadUrl = window.URL.createObjectURL(preview.blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = file.FullFileName || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch {
      setErrorMessage("Không thể tải tệp xuống.");
    }
  };

  const renderContent = () => {
    if (isLoading && (!officeBlob || viewerType !== "office")) {
      return (
        <div className="flex flex-col items-center justify-center text-sm text-zinc-400 gap-4 h-full">
          <Loader2 className="size-8 animate-spin text-zinc-500" />
          <p>Đang tải tệp xem trước...</p>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-12 flex flex-col items-center text-center text-white ring-1 ring-white/10 max-w-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <File className="size-16 text-rose-500 mb-4" />
          <h4 className="text-lg font-medium mb-2">Lỗi tải tệp</h4>
          <p className="text-zinc-400 text-sm">{errorMessage}</p>
        </div>
      );
    }

    if (!blobUrl && viewerType !== "office") {
      return (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-12 flex flex-col items-center text-center text-white ring-1 ring-white/10 max-w-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <File className="size-16 text-zinc-500 mb-4" />
          <h4 className="text-lg font-medium mb-2">Không có dữ liệu gốc</h4>
          <p className="text-zinc-400 text-sm">
            Tệp này không tồn tại hoặc đã bị xóa.
          </p>
        </div>
      );
    }

    if (viewerType === "pdf") {
      return (
        <div
          ref={pdfContainerRef}
          data-testid="pdf-scroll-container"
          className="w-full max-w-[95vw] h-full max-h-[85vh] overflow-hidden rounded-xl bg-[#2b2b2b] shadow-2xl ring-1 ring-black/5"
          tabIndex={0}
          onKeyDown={(event) => {
            if (!event.ctrlKey) return;

            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              increaseZoom();
              return;
            }

            if (event.key === "-" || event.key === "_") {
              event.preventDefault();
              decreaseZoom();
              return;
            }

            if (event.key === "0") {
              event.preventDefault();
              resetZoom();
            }
          }}
        >
          <PdfViewer fileUrl={blobUrl!} zoom={zoom} />
        </div>
      );
    }

    if (viewerType === "image") {
      return (
        <img
          data-testid="image-preview"
          src={blobUrl!}
          alt={file?.FullFileName}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl ring-1 ring-white/10 transition-transform duration-300 ease-out"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "center",
          }}
        />
      );
    }

    if (viewerType === "video") {
      return (
        <div
          data-testid="video-preview-wrapper"
          className="w-full max-w-5xl max-h-full rounded-2xl overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
        >
          <video
            controls
            src={blobUrl!}
            className="w-full max-h-full aspect-video object-contain"
            autoPlay
          />
        </div>
      );
    }

    if (viewerType === "office") {
      const isExcel = ["xlsx", "xls"].includes(fileExt?.replace(".", "") || "");

      if (isExcel) {
        if (isLoading || !workbook) {
          return (
            <div className="flex flex-col items-center justify-center text-sm text-zinc-400 gap-4 h-full">
              <Loader2 className="size-8 animate-spin text-zinc-500" />
              <p>Đang phân tích bảng tính...</p>
            </div>
          );
        }

        return (
          <div className="w-full h-full max-w-[95vw] max-h-[85vh]">
            <ExcelViewer
              workbook={workbook}
              activeSheet={activeSheet}
              onSheetChange={setActiveSheet}
              zoom={zoom}
            />
          </div>
        );
      }

      // Word / other office — native docx-preview wrapper
      return (
        <div
          className="w-full max-w-[95vw] h-full max-h-[85vh] overflow-auto rounded-xl bg-[#f8f9fa] shadow-2xl ring-1 ring-black/5 custom-scrollbar relative"
          tabIndex={0}
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 bg-[#f8f9fa]/80 backdrop-blur-sm flex flex-col items-center justify-center text-sm text-gray-600 font-medium gap-3">
              <Loader2 className="size-8 animate-spin text-blue-500" />
              <p>Đang vẽ tài liệu...</p>
            </div>
          )}
          <div
            ref={officeContainerRef}
            className="w-full min-h-full transition-transform duration-300 ease-out origin-top [&>.docx-wrapper]:!bg-transparent [&>.docx-wrapper]:!p-4 md:[&>.docx-wrapper]:!p-8 [&>.docx-wrapper>section.docx]:!bg-white [&>.docx-wrapper>section.docx]:!shadow-xl [&>.docx-wrapper>section.docx]:!mb-8 [&>.docx-wrapper>section.docx]:!mx-auto"
            style={{
              transform: `scale(${zoom / 100})`,
              marginBottom: zoom > 100 ? `${(zoom - 100) * 8}px` : "0",
            }}
          />
        </div>
      );
    }

    return (
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-12 flex flex-col items-center text-center text-white ring-1 ring-white/10 max-w-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <File className="size-16 text-zinc-500 mb-4" />
        <h4 className="text-lg font-medium mb-2">Không có bản xem trước</h4>
        <p className="text-zinc-400 text-sm">
          Định dạng tệp này không được hỗ trợ xem trực tiếp. Vui lòng tải xuống
          để xem nội dung.
        </p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        {/* A dark translucent blur background */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-md transition-opacity animate-in fade-in duration-200" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col pointer-events-auto bg-transparent focus:outline-none">
          {/* Screen-reader title (visually hidden — visual title is in the header bar) */}
          <DialogPrimitive.Title className="sr-only">
            {file?.FullFileName ?? "Xem trước tệp"}
          </DialogPrimitive.Title>

          {/* Sleek Header */}
          <div className="flex items-center justify-between px-4 h-16 bg-gradient-to-b from-black/50 to-transparent shrink-0 relative z-10 w-full">
            <div className="flex items-center gap-4 text-white">
              <div className="p-2 bg-white/10 rounded-lg backdrop-blur-md">
                {getFileIcon(viewerType, "size-5")}
              </div>
              <div>
                <h3 className="font-medium text-[15px] truncate max-w-[300px] md:max-w-md">
                  {file?.FullFileName || "Unnamed file"}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
                  <span className="uppercase tracking-wider">
                    {fileExt || "unknown"}{" "}
                    {viewerType !== "video" &&
                    viewerType !== "office" &&
                    viewerType !== "image"
                      ? ""
                      : `- ${viewerType}`}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                  <span>{formatFileSize(file?.FileSize)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom controls for documents/images, hid for video */}
              {["office", "image", "pdf"].includes(viewerType) && (
                <div className="hidden md:flex items-center gap-1 bg-white/10 rounded-lg p-1 mr-4 backdrop-blur-md">
                  <button
                    onClick={decreaseZoom}
                    className="p-1.5 text-zinc-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="size-4" />
                  </button>
                  <span className="text-xs font-medium text-zinc-300 w-12 text-center">
                    {zoom}%
                  </span>
                  <button
                    onClick={increaseZoom}
                    className="p-1.5 text-zinc-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="size-4" />
                  </button>
                </div>
              )}

              {/* Print Button Wrapper - Temporarily Hidden */}
              {/* 
              {["office", "pdf"].includes(viewerType) && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium backdrop-blur-md"
                >
                  <Printer className="size-4" />
                  <span className="hidden sm:inline">In</span>
                </button>
              )}
              */}

              {allowDownload && (
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-medium backdrop-blur-md"
                >
                  <Download className="size-4" />
                  <span className="hidden sm:inline">Tải xuống</span>
                </button>
              )}

              <div className="w-px h-6 bg-white/20 mx-1"></div>

              <button
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <XIcon className="size-5" />
              </button>
            </div>
          </div>

          {/* Main Canvas Area */}
          <div
            data-testid="preview-canvas"
            className={cn(
              "flex-1 flex items-center justify-center relative p-4 md:p-8",
              shouldUseScrollableCanvas ? "overflow-auto" : "overflow-hidden",
            )}
          >
            {renderContent()}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};

export default FileViewerDialog;
