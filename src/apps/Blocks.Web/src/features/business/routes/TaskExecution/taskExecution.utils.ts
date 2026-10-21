export function getTaskStatusLabel(status: number): string {
  switch (status) {
    case 2:
      return "Đang thực hiện";
    case 3:
      return "Hoàn thành";
    case 4:
      return "Có lỗi/cần kiểm tra lại";
    default:
      return "Không xác định";
  }
}
