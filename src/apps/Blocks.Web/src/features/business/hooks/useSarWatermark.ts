import { useQuery } from "@tanstack/react-query";
import { externalReviewService } from "@/features/business/api/externalReview.api";

export interface SarWatermarkConfig {
  watermarkText: string | null | undefined;
  opacity: number;
  position: number;
  dynamicWatermarkText: string | null | undefined;
}

export function useSarWatermark(
  cycleId: string | undefined,
  enabled: boolean,
): SarWatermarkConfig {
  const { data } = useQuery({
    queryKey: ["sar-watermark", cycleId],
    queryFn: () => externalReviewService.get({ CycleId: cycleId! }),
    enabled: enabled && !!cycleId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    watermarkText: data?.Data?.WatermarkText ?? null,
    opacity: data?.Data?.WatermarkOpacity ?? 25,
    position: data?.Data?.WatermarkPosition ?? 0,
    dynamicWatermarkText: data?.Data?.DynamicWatermarkText ?? null,
  };
}
