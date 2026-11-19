export type CollectionContentState =
  | "none"
  | "invalid"
  | "loading"
  | "unavailable"
  | "denied"
  | "outage"
  | "ready";

const copy: Record<Exclude<CollectionContentState, "ready">, string> = {
  none: "Hãy chọn hoặc tạo một bộ sưu tập để bắt đầu.",
  invalid: "Liên kết bộ sưu tập không hợp lệ. Hãy chọn lại từ danh sách.",
  loading: "Đang tải bộ sưu tập...",
  unavailable: "Bộ sưu tập không tồn tại hoặc bạn không có quyền truy cập.",
  denied: "Bạn chưa được cấp quyền xem KnowledgeHub.",
  outage: "Dịch vụ KnowledgeHub đang tạm thời không khả dụng.",
};

export function CollectionState({
  state,
}: {
  state: Exclude<CollectionContentState, "ready">;
}) {
  return (
    <div
      data-state={state}
      role={state === "loading" ? "status" : "alert"}
      className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      {copy[state]}
    </div>
  );
}
