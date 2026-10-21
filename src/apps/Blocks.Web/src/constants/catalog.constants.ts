import type { ModelCombobox } from "@/types/base/base.types";

// Centralized stakeholder type options from catalog service
export const STAKEHOLDER_TYPES: ModelCombobox[] = [
  { Value: "1", Text: "Sinh viên" },
  { Value: "2", Text: "Cựu sinh viên" },
  { Value: "3", Text: "Nhà tuyển dụng" },
  { Value: "4", Text: "Giảng viên" },
];

// Active status options for filtering
export const ACTIVE_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "true", Text: "Hoạt động" },
  { Value: "false", Text: "Không hoạt động" },
];

// Evaluation mode options for StandardSet
export const EVALUATION_MODE_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Thang điểm 7" },
  { Value: "2", Text: "Đạt / không đạt" },
];

// Cycle status options for filtering and form
export const CYCLE_STATUS_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Lập kế hoạch" },
  { Value: "2", Text: "Thực hiện" },
  { Value: "3", Text: "Kiểm tra" },
  { Value: "4", Text: "Cải tiến" },
  { Value: "5", Text: "Kết thúc" },
];

// Cycle scope options for filtering and form
export const CYCLE_SCOPE_OPTIONS: ModelCombobox[] = [
  { Value: "1", Text: "Cấp chương trình" },
  { Value: "2", Text: "Cấp cơ sở" },
];

export const CHART_TYPE_OPTIONS: ModelCombobox[] = [
  { Value: "0", Text: "Biểu đồ radar" },
  { Value: "1", Text: "Biểu đồ thanh" },
];

export const CYCLE_STATUS_LABEL: Record<number, { label: string; className: string }> = {
  1: { label: "Lập KH", className: "bg-slate-100 text-slate-700" },
  2: { label: "Thực hiện", className: "bg-blue-100 text-blue-700" },
  3: { label: "Kiểm tra", className: "bg-green-100 text-green-700" },
  4: { label: "Cải tiến", className: "bg-yellow-100 text-yellow-700" },
  5: { label: "Kết thúc", className: "bg-gray-100 text-gray-500" },
};

// Council roles — matches CouncilRole enum in BE (RBAC §5.1)
export const COUNCIL_ROLES: ModelCombobox[] = [
  { Value: "1", Text: "Chủ tịch HĐ" },
  { Value: "2", Text: "Phó Chủ tịch HĐ" },
  { Value: "3", Text: "Thư ký" },
  { Value: "4", Text: "Thành viên ĐG" },
  { Value: "5", Text: "Người cung cấp MC" },
];
