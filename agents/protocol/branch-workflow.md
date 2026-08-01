# Branch Workflow

## Mục đích

Tài liệu này định nghĩa quy trình tạo và quản lý nhánh (branch) hoặc git worktree trong môi trường phát triển của Blocks, tương ứng với skill `using-git-worktrees` và `finishing-a-development-branch`.

## Khởi tạo Worktree (using-git-worktrees)

1. Khi được cấp một thiết kế đã duyệt, agent tự động tạo một branch mới hoặc git worktree độc lập.
2. Cài đặt các thư viện/dependency (nếu cần thiết) trong môi trường đó.
3. Chạy baseline test (kiểm tra trạng thái hệ thống) để đảm bảo không có lỗi tồn tại trước khi bắt đầu công việc.

## Đóng Worktree (finishing-a-development-branch)

Sau khi tất cả tác vụ (task) hoàn tất:
1. Đảm bảo toàn bộ test case đều Pass.
2. Trình bày các lựa chọn đóng nhánh:
   - **Merge**: Trực tiếp gộp nhánh (nếu được user phê duyệt).
   - **Pull Request**: Tạo PR để chờ review thêm.
   - **Keep**: Giữ nguyên worktree để kiểm tra thêm.
   - **Discard**: Hủy bỏ mọi thay đổi nếu không đạt yêu cầu.
3. Thực hiện dọn dẹp worktree tương ứng với lựa chọn.
