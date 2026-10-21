import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExternalReviewDetail } from "@/features/business/types/externalReview.types";

const WATERMARK_POSITION_LABELS = ["Vát chéo 45°", "Chính giữa", "Lặp lại"];

interface WatermarkTabProps {
  review: ExternalReviewDetail;
  isSubmitting: boolean;
  isReadOnly: boolean;
  onUpdateWatermark: (payload: {
    text?: string | null;
    opacity: number;
    position: number;
  }) => Promise<void>;
}

export function WatermarkTab({
  review,
  isSubmitting,
  isReadOnly,
  onUpdateWatermark,
}: WatermarkTabProps) {
  const [watermarkText, setWatermarkText] = useState<string>(
    review.WatermarkText || "",
  );
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(
    review.WatermarkOpacity ?? 25,
  );
  const [watermarkPosition, setWatermarkPosition] = useState<number>(
    review.WatermarkPosition ?? 0,
  );

  useEffect(() => {
    setWatermarkText(review.WatermarkText || "");
    setWatermarkOpacity(review.WatermarkOpacity ?? 25);
    setWatermarkPosition(review.WatermarkPosition ?? 0);
  }, [review]);

  const disabled = isSubmitting || isReadOnly;

  const handleSave = () => {
    void onUpdateWatermark({
      text: watermarkText.trim() || null,
      opacity: watermarkOpacity,
      position: watermarkPosition,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nội dung Watermark
          </label>
          <Input
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="VD: BẢN MẬT - ĐH ABC - ĐGN 2026"
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Độ mờ (Opacity)
            </label>
            <span className="text-xs font-medium text-slate-700">
              {watermarkOpacity}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={watermarkOpacity}
            onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
            disabled={disabled}
            className="h-2 w-full cursor-pointer rounded-lg accent-slate-700 disabled:opacity-50"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vị trí
          </label>
          <div className="flex flex-wrap gap-2">
            {WATERMARK_POSITION_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => setWatermarkPosition(i)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-60",
                  watermarkPosition === i
                    ? "border-slate-700 bg-slate-700 font-medium text-white"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Tự động nối thêm (không chỉnh được):</strong>
          <br />
          Email chuyên gia · IP · Thời gian xem
        </div>

        {!isReadOnly ? (
          <Button type="button" onClick={handleSave} disabled={disabled}>
            {isSubmitting ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Mô phỏng tài liệu
        </label>

        <div className="rounded-lg bg-slate-200 p-4">
          <div
            className="relative mx-auto overflow-hidden rounded bg-white shadow-md"
            style={{ minHeight: "280px", maxWidth: "360px" }}
          >
            <div className="p-6 space-y-2">
              {[85, 100, 70, 90, 55, 80, 100, 65].map((w, i) => (
                <div
                  key={i}
                  className="h-2 rounded bg-slate-200 blur-[1.5px]"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>

            <div
              className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
              style={{ opacity: watermarkOpacity / 100 }}
            >
              {watermarkPosition === 2 ? (
                <div className="grid grid-cols-3 gap-6 p-4">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span
                      key={i}
                      className="whitespace-nowrap rotate-[-30deg] text-[10px] font-black text-slate-400"
                    >
                      {watermarkText || "Watermark"}
                    </span>
                  ))}
                </div>
              ) : (
                <span
                  className="whitespace-nowrap rounded border-2 border-slate-400 px-2 py-0.5 font-black text-slate-400"
                  style={{
                    fontSize: "clamp(11px, 2.5vw, 20px)",
                    transform: watermarkPosition === 0 ? "rotate(-35deg)" : "none",
                  }}
                >
                  {watermarkText || "Watermark preview"}
                </span>
              )}
            </div>

            <div
              className="pointer-events-none absolute bottom-2 right-3 select-none text-right font-mono leading-tight text-slate-400"
              style={{ fontSize: "9px", opacity: watermarkOpacity / 100 }}
            >
              chuyengia@email.com · 192.168.1.1
              <br />
              12/04/2026 08:30
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
