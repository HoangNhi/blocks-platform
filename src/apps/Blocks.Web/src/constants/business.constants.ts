import type { ModelCombobox } from "@/types/base/base.types";

export const SESSION_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "all", Text: "Tất cả trạng thái" },
  { Value: "1", Text: "Chưa gửi" },
  { Value: "2", Text: "Đã gửi" },
  { Value: "3", Text: "Đã hoàn thành" },
];

export const CAMPAIGN_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Chưa bắt đầu" },
  { Value: "2", Text: "Đang diễn ra" },
  { Value: "3", Text: "Đã kết thúc" },
];

// Evidence status options (matching backend enum)
export const EVIDENCE_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Dự thảo" },
  { Value: "2", Text: "Chờ duyệt" },
  { Value: "3", Text: "Đã duyệt" },
  { Value: "4", Text: "Từ chối" },
];

// Evidence cycle map review status options
export const EVIDENCE_CYCLE_MAP_REVIEW_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Chưa bắt đầu" },
  { Value: "2", Text: "Đang tiến hành" },
  { Value: "3", Text: "Hoàn thành" },
];
