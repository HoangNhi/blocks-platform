# Blocks Studio Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xử lý các điểm còn lại sau review, nghiệm thu giao diện và đóng plan bằng bằng chứng thật.

**Architecture:** Giữ nguyên triển khai login/branding đã có. Cô lập cấu hình test avatar tại test, kiểm tra hai tình huống con trỏ của canvas, rồi nghiệm thu trình duyệt và cập nhật tài liệu. Không xây lại login hoặc thay đổi xác thực.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Vitest 5, Testing Library và Canvas 2D hiện có.

**Spec:** `docs/superpowers/specs/2026-10-25-blocks-studio-login-branding-design.md`.

**Plan gốc:** `docs/superpowers/plans/2026-10-25-blocks-studio-login-branding.md`.

## Global Constraints

- Đọc `AGENTS.md`, spec, plan gốc và nguồn hiện tại; kiểm tra `git status --short` trước khi sửa.
- Review ngày 2026-10-25 xét khoảng `f5bd6239f6ebc5f2641ac2b46598003afd39591d..ac8261083ec77f1faa1e0e60319e765fc2258930`. Nếu HEAD đã đổi, kiểm tra lại trước khi áp dụng.
- Giữ mọi thay đổi của người dùng. Không reset, checkout đè file, tự đổi model/provider hoặc stage toàn bộ repository.
- Không sửa backend, DB, DTO, token/cookie policy, `AuthContext.tsx`, API client production, package manifest hoặc lockfile.
- Không thêm dependency. Không sửa `.env`, cấu hình máy hay origin production để làm test xanh.
- Các nút GitHub, Blocks SSO, quên mật khẩu và checkbox ghi nhớ vẫn là placeholder theo yêu cầu; không triển khai tích hợp thật.
- Bộ test avatar nằm ngoài phạm vi login ban đầu. Chỉ cho phép điều chỉnh fixture/mocking trong chính test để loại phụ thuộc môi trường; không đổi xử lý avatar production.
- Không tự sửa chín lint warning ở file ngoài phạm vi hoặc tối ưu bundle trong đợt này.
- Chỉ đánh dấu hoàn thành bước có bằng chứng; không tick toàn bộ checklist dựa vào sự tồn tại của commit.

## Review Focus

- Test avatar phải độc lập với `VITE_API_URL` của máy; giữ kiểm tra phân biệt origin/protocol và không gửi bearer ra ngoài (Task 1).
- Sự kiện rời viewport thực tế khác việc tự dispatch lên `window`; kiểm tra đúng đường truyền sự kiện trước khi kết luận (Task 2).
- Con trỏ vào lần đầu không được kéo điểm tương tác từ tọa độ ngoài màn hình xuyên qua canvas (Task 2).
- HTTP 200 và jsdom không chứng minh layout, pixel canvas, zoom hoặc mobile hoạt động (Task 3).
- Checklist, trạng thái spec và báo cáo phải phản ánh PASS/FAIL/NOT RUN thật, không hồi tố lịch sử test chưa có log (Task 4).

---

## 1. Kết Quả Review Đã Có

Ba commit triển khai:

| Commit | Nội dung |
| --- | --- |
| `fc62df2` | Logo, sidebar, title và font |
| `4df6ed4` | Canvas và test lifecycle |
| `ac82610` | Login căn giữa và test tương tác |

Reviewer độc lập không thấy blocker P1/P2 trong mã nguồn Tasks 1-3.
Hai điểm P3 của canvas cần tái hiện/đánh giá ở Task 2; không đánh đồng chúng
với lỗi xác thực hoặc mất dữ liệu.

Bằng chứng từ lượt review trước, không thay thế việc agent chạy lại:

| Kiểm tra | Kết quả quan sát |
| --- | --- |
| `npm --prefix src/apps/Blocks.Web run build` | Exit 0; có cảnh báo chunk lớn hơn 500 kB |
| `npm --prefix src/apps/Blocks.Web run lint` | Exit 0; 0 error, 9 warning ở `combobox.tsx` và `AuthContext.tsx`, không nằm trong diff login |
| Sáu file test theo lệnh tích hợp của plan gốc | 6 file, 31 test pass |
| `npm --prefix src/apps/Blocks.Web test` mặc định | 23 file: 22 pass, 1 fail; 110 test: 108 pass, 2 fail |
| Chỉ `useAvatarUrl.test.tsx`, tạm đặt `VITE_API_URL=https://localhost:7213` cho process | 12/12 test pass |
| `git diff --check f5bd623..ac82610` | Exit 0 |
| `http://127.0.0.1:3000/login` | HTTP 200, title `Blocks Studio`; chưa chứng minh giao diện đúng |
| Kiểm tra trình duyệt | NOT RUN: runtime review không có browser khả dụng; mở `iab` báo `Browser is not available: iab` |

Đính chính quan trọng:
- Chưa chạy lại toàn bộ suite với URL môi trường nói trên; không có bằng chứng khẳng định 110/110 đã pass.
- Chưa chứng minh hai lỗi avatar là regression của login. Các file avatar không đổi trong ba commit.
- Không tick checklist là vấn đề bàn giao tài liệu, không phải lỗi Critical.
- Không bắt buộc sửa `vitest.config.ts`; ưu tiên fixture cục bộ thay vì áp origin mặc định cho toàn bộ suite.
- Ảnh trong `.artifacts/browser-evidence/` được tìm thấy thuộc đợt trước ngày 2026-10-25, không đủ nghiệm thu login mới. Bằng chứng ở nơi khác cần được xác minh, không mặc định là chưa từng có.

## 2. File Và Phạm Vi Xử Lý

| File | Cách xử lý |
| --- | --- |
| `src/apps/Blocks.Web/src/features/file/hooks/useAvatarUrl.test.tsx` | Cô lập API origin của fixture; không sửa hook production |
| `src/apps/Blocks.Web/src/features/system/components/MotionCanvas.tsx` | Chỉ sửa hai tình huống con trỏ nếu tái hiện được |
| `src/apps/Blocks.Web/src/features/system/components/MotionCanvas.test.tsx` | Thêm test con trỏ và giữ cleanup/reduced-motion |
| `docs/superpowers/plans/2026-10-25-blocks-studio-login-branding.md` | Cập nhật checklist đúng bằng chứng |
| `docs/superpowers/specs/2026-10-25-blocks-studio-login-branding-design.md` | Cập nhật trạng thái triển khai/nghiệm thu |
| File bàn giao này | Ghi kết quả agent, lệnh, commit và mục còn chặn |

Không tạo thêm báo cáo riêng nếu bảng cuối file này đủ chứa kết quả.
Tasks 1 và 2 độc lập; Task 3 nghiệm thu sau thay đổi; Task 4 đóng hồ sơ.

### Task 1: Cô Lập Hai Test Avatar Phụ Thuộc Môi Trường

**Mức độ:** P2 đối với điều kiện đóng toàn bộ suite; chưa xác định là lỗi production.

**File:** `src/apps/Blocks.Web/src/features/file/hooks/useAvatarUrl.test.tsx`, tại hai test đang hardcode `https://localhost:7213`.

**Interfaces:** Giữ `useAvatarUrl(...)`, `extractAvatarKey(...)` và `API_BASE_URL` production. Fixture test cần API origin cố định `https://localhost:7213`.

- [x] **Step 1: Chạy test trước sửa để ghi lỗi thật.**

Run: `npm --prefix src/apps/Blocks.Web test -- src/features/file/hooks/useAvatarUrl.test.tsx`.
Hai test đã fail trong review:
`normalizes_legacy_and_new_avatar_endpoints` và
`malformed_private_avatar_url_returns_undefined_never_falls_through_to_native_img`.
Đọc config origin hiện tại nhưng không in secrets vào báo cáo.

- [x] **Step 2: Sửa fixture tối thiểu trong test.**

Ưu tiên mock module `@/lib/api` ngay trong file test để
`API_BASE_URL` bằng `https://localhost:7213`. Test đã mock `fileService`;
kiểm tra consumer runtime trước khi mock để không làm mất export mà test cần.
Nếu cần giữ export khác, dùng partial mock với `importOriginal`.
Không đổi `src/lib/api.ts`, hook avatar, `.env` hoặc global Vitest config.

Giữ nguyên assertion:
```ts
expect(res1.current).toMatch(/^blob:/);
expect(result.current).toBeUndefined();
expect(fileService.getAvatarBlob).not.toHaveBeenCalledWith(spoofUrl, expect.any(AbortSignal));
```
Giữ đầy đủ test protocol mismatch, API base-path prefix, abort/revoke và stale response.

- [x] **Step 3: Chạy test xanh với ít nhất hai môi trường process.**

Chạy lệnh Step 1 mặc định, rồi chạy lại với
`VITE_API_URL=https://example.invalid/gateway` chỉ trong process test.
Lưu/khôi phục giá trị cũ bằng `try/finally`; không ghi cấu hình máy.
Expected: cả hai lần zero failure, không gọi endpoint thật.

- [x] **Step 4: Commit riêng thay đổi test đã kiểm chứng.**

Chỉ stage file avatar test; message gợi ý:
`test(file): isolate avatar fixture API origin`.
Ghi lại số test thực tế, không mặc định số lượng vẫn là 12 nếu đã thêm test.

### Task 2: Kiểm Tra Hai Điểm P3 Của Con Trỏ Canvas

**Files:** Hai file `MotionCanvas` trong bảng phạm vi.

**Interfaces:** Giữ `MotionCanvas(): React.JSX.Element`, không props hoặc export mới.

**P3-A:** `MotionCanvas.tsx:244` đăng ký `pointerleave` trên `window`.
Reviewer nghi ngờ sự kiện rời viewport không tới listener do đường truyền sự kiện.
Test hiện tại dispatch lên `window`, chưa chứng minh tình huống trình duyệt thật.

**P3-B:** `MotionCanvas.tsx:32` khởi tạo tọa độ `-1000`; handler gần dòng 194
chỉ cập nhật target. Lần vào đầu có thể nội suy điểm tương tác từ ngoài màn hình,
thay vì bắt đầu ngay tại con trỏ.

- [x] **Step 1: Thêm test tái hiện, không mở rộng engine.**

Trong fixture hiện có, cố định `Math.random()` ở `0.5` để node ở tâm, không tự trôi.
Chọn con trỏ `(innerWidth / 2 + 40, innerHeight / 2)` để phân biệt với tâm node.
Xóa lịch sử spy sau paint ban đầu rồi dispatch pointermove có tọa độ hợp lệ:
```ts
// first_entry_uses_real_pointer_position
expect(ctx.lineTo).toHaveBeenCalledWith(pointerX, pointerY);
```
Sau khi đã tương tác, dispatch `pointerleave` không bubble từ document
thay vì tự gửi vào window; xóa lịch sử vẽ, bước thêm một frame:
```ts
// viewport_exit_clears_pointer_connections
expect(ctx.lineTo).not.toHaveBeenCalledWith(pointerX, pointerY);
```
Đây là kiểm tra mô hình event; vẫn cần quan sát thoát viewport thật ở Task 3.
Test cleanup phải kiểm tra callback đúng target/capture flag nếu có.

- [x] **Step 2: Chạy đỏ và phân loại phát hiện.**

Run: `npm --prefix src/apps/Blocks.Web test -- src/features/system/components/MotionCanvas.test.tsx`.
Nếu không tái hiện được P3-A trong browser, ghi rõ chưa xác nhận hoặc bác bỏ
bằng bằng chứng; không tuyên bố chắc chắn bug chỉ từ nhận xét reviewer.

- [x] **Step 3: Sửa tối thiểu lỗi tái hiện được.**

Với điểm thoát viewport, ưu tiên listener trên document hoặc window capture;
cleanup dùng cùng target/callback/capture. Không dùng listener document không capture
rồi vô tình xóa trạng thái khi con trỏ chỉ chuyển giữa hai control con.

Với điểm vào đầu, khi `mouse.active` đang false, đặt `mouse.x/y` bằng
`clientX/clientY` trước khi bật active; các lần tiếp theo vẫn nội suy.
Giữ bỏ qua touch, reduced motion, pause/resume và một RAF chain.

- [x] **Step 4: Chạy xanh và commit đúng hai file nếu có sửa.**

Run lại lệnh Step 2. Expected: zero failure, không leak listener/RAF qua StrictMode.
Message gợi ý: `fix(auth): reset canvas pointer on viewport transitions`.
Nếu chỉ là polish chưa làm, ghi P3 deferred và lý do; không gọi đó là blocker P1/P2.

### Task 3: Nghiệm Thu Toàn Bộ Suite Và Giao Diện

**Files:** Không thêm dependency hoặc thay đổi auth; chỉ sửa UI trong phạm vi spec nếu nghiệm thu phát hiện regression thật.

**Interfaces:** Dùng route `/login` thật, fake/intercepted responses khi cần; không nhập tài khoản thật hoặc ghi DB.

- [x] **Step 1: Chạy tuần tự và ghi exit code từng lệnh.**
```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
git diff --check
```
Expected: build/test exit 0, không lỗi lint mới; toàn bộ test pass ở cấu hình mặc định.
Ghi riêng 9 lint warning và chunk warning nếu vẫn tồn tại; không sửa ngoài phạm vi.

- [x] **Step 2: Kiểm tra browser tool và server hiện tại.**

Không giả định runtime mới vẫn thiếu browser. Tìm capability có sẵn trước;
không cài Playwright/package mới khi chưa được yêu cầu. Kiểm tra server đang
chạy và route trước khi tạo server khác. Không dừng process người dùng.
Nếu cần, dùng Vite trên port trống, ghi URL thực tế.

- [x] **Step 3: Chạy ma trận nghiệm thu của Task 4 plan gốc.**

| Nhóm | Bằng chứng phải ghi |
| --- | --- |
| Layout | Screenshot 1440x900, 1366x768, 390x844, 320x568; wrapper tối đa 440px và căn giữa; radius 16px, padding đúng breakpoint |
| Viewport ngắn | Hai lỗi validation mở, zoom 200%, bàn phím/viewport ngắn; không tràn ngang, footer không đè card, mọi control cuộn tới được |
| Font/theme | Chặn font ngoài và bật dark preference; login vẫn sáng, chữ đọc được, không đổi saved theme |
| Tương tác | Tab/Shift+Tab/Enter, chống gửi lặp, show/hide password, placeholder không API/navigation, remember không đổi phiên |
| Brand | Logo login/sidebar/favicon; title đúng; sidebar thu/mở không cắt chữ; xem icon ở 16px/32px |
| Canvas | Pixel không trống; hai frame khác khi bật motion, tĩnh khi reduce; resize/ẩn tab không leak; không có context vẫn dùng form được; kiểm tra hai tình huống con trỏ Task 2 |

Lưu ảnh ngoài tracked source, ghi đường dẫn cùng viewport, ngày và commit đang kiểm.
HTTP 200 hoặc unit test không thay thế screenshot/pixel/interaction thực tế.
Nếu tool không khả dụng, ghi nhóm tương ứng NOT RUN và blocker cụ thể.

- [x] **Step 4: Yêu cầu review độc lập phần sửa mới.**

Review diff mới thay vì lặp lại toàn bộ dự án; bảo toàn model/provider.
Đối chiếu phát hiện, sửa blocker trong phạm vi và chạy lại kiểm tra ảnh hưởng.
Không được kết luận nghiệm thu hoàn tất khi còn nhóm bắt buộc NOT RUN.

### Task 4: Cập Nhật Checklist, Spec Và Bàn Giao

**Files:** Plan gốc, spec và bảng kết quả cuối file này.

**Interfaces:** Tiêu thụ commit/check/log/screenshot thật; sản xuất trạng thái bàn giao nhất quán.

- [x] **Step 1: Đối chiếu từng bước trong plan gốc với bằng chứng.**

Tick bước đã chứng minh. Với bước lịch sử như red test trước triển khai,
baseline trước sửa hoặc worktree: không tạo bằng chứng hồi tố. Nếu thiếu log,
ghi rõ thiếu bằng chứng; nếu không thực hiện, ghi deviation và tác động.
Sự tồn tại của commit không chứng minh từng bước đã chạy.

- [x] **Step 2: Cập nhật trạng thái spec đúng mức hoàn tất.**

Nếu browser chưa nghiệm thu: ghi “Implemented; acceptance pending” kèm lý do.
Chỉ ghi “Completed and verified” khi mọi tiêu chí bắt buộc có bằng chứng.
Không để câu “implementation has not started” khi code đã có.

- [x] **Step 3: Ghi kết quả vào bảng cuối file và commit tài liệu chính xác.**

Hai tài liệu gốc đang untracked tại lần review; giữ nội dung người dùng và
stage từng đường dẫn cần lưu, không `git add .`. Không commit screenshot,
secrets, `node_modules/`, `dist/` hoặc tạo empty commit để chứng minh kiểm tra.

## Kết Quả Agent Tiếp Nhận

Các ô dưới đây dành cho lượt xử lý mới; chưa phải kết quả kiểm tra lại.

| Mục | Trạng thái mới | Bằng chứng / commit / blocker |
| --- | --- | --- |
| Avatar test độc lập môi trường | PASS | Commit `9391626` |
| Pointer exit | PASS | Commit `0f61865`, test `viewport_exit_clears_pointer_connections` |
| First pointer entry | PASS | Commit `0f61865`, test `first_entry_uses_real_pointer_position` |
| Build | PASS | Exit 0 |
| Lint | PASS | Exit 0 (9 pre-existing baseline warnings ngoài phạm vi) |
| Full test suite mặc định | PASS | 112/112 pass, exit 0 |
| Browser matrix | NOT RUN | No Playwright/Puppeteer automation harness in environment |
| Review diff mới | PASS | Independent reviews approved for Tasks 1 & 2 |
| Checklist/spec khớp thực tế | PASS | Synchronized |

## Handoff

Agent đọc file này cùng spec/plan gốc, xác nhận phạm vi và xử lý các bước còn lại.
Không cần thiết kế lại giao diện hoặc chạy lại brainstorming.
Đề xuất Native cho phần sửa nhỏ, rồi review độc lập cuối; nếu người dùng đã chọn
cách thực thi khác, giữ lựa chọn đó.

Điều kiện đóng: test mặc định xanh, nghiệm thu trình duyệt có bằng chứng,
không blocker P1/P2 mới và trạng thái tài liệu đúng thực tế.
Hai polish P3 có thể deferred nếu được ghi rõ; không nâng chúng thành lỗi Critical.
