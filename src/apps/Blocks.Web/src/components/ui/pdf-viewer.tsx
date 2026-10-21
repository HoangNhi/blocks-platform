import { useEffect, useRef, useState } from "react";
import { getDocument } from "pdfjs-dist";
import "@/lib/pdf-worker";

interface PdfViewerProps {
  fileUrl: string;
  zoom: number;
}

export function PdfViewer({ fileUrl, zoom }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const [error, setError] = useState<string | null>(null);

  // Keep ref up to date to avoid re-rendering entire PDF on zoom changes
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Effect 1: Render the PDF ONCE when the fileUrl changes
  useEffect(() => {
    let cancelled = false;

    const renderPdf = async () => {
      setError(null);
      const container = containerRef.current;
      if (!container) return;

      container.innerHTML = "";

      try {
        const pdf = await getDocument(fileUrl).promise;
        const fragment = document.createDocumentFragment();

        // Use higher base render scale for sharper zoom quality
        const renderScale = typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 1.5) : 1.5;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: renderScale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          const baseWidth = viewport.width / renderScale;
          canvas.dataset.baseWidth = baseWidth.toString();

          // Set initial size based on the current zoom level to avoid flash jump
          canvas.style.width = `${Math.floor(baseWidth * (zoomRef.current / 100))}px`;
          canvas.style.height = "auto";
          canvas.className = "mx-auto mb-4 bg-white shadow-sm transition-all duration-200 ease-out";

          fragment.appendChild(canvas);
          await page.render({ canvasContext: context, viewport, canvas } as any).promise;

          if (cancelled) return;
        }

        container.appendChild(fragment);
      } catch {
        if (!cancelled) {
          setError("Không thể hiển thị PDF.");
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]); // Removed zoom dependency to eliminate flashing

  // Effect 2: Update canvas dimensions instantly when zoom changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvases = container.querySelectorAll("canvas");
    canvases.forEach((canvas) => {
      const baseWidth = parseFloat(canvas.dataset.baseWidth || "0");
      if (baseWidth) {
        canvas.style.width = `${Math.floor(baseWidth * (zoom / 100))}px`;
      }
    });
  }, [zoom]);

  return (
    <div
      data-testid="pdf-canvas-viewer"
      className="w-full h-full overflow-auto p-4 md:p-6"
    >
      {error ? (
        <div className="text-sm text-red-500">{error}</div>
      ) : (
        <div ref={containerRef} className="w-full" />
      )}
    </div>
  );
}
