# KnowledgeHub P02 — Working Evidence Notes (Tasks 17–18)

- **Branch:** `feature/knowledgehub-learning`
- **Base commit before Task 17–18:** `327d381084caf9e0bbaa4a3299acf1ce98eaeb99`
- **Test actor (nonsecret identifier):** `admin` (`5b6f068a-8d49-4368-86d2-bc0f13300a53`)
- **Pre-existing collection preserved:** `Test 01` (`ba92c17f-243d-4bbd-b6f6-70aaa82300dc`)
- **Theme / browser baseline:** Light theme, Chromium (Playwright `1.65.2`), zoom 100%, DPR 1, viewports `1280x1024`, `1440x900`, `390x844`.
- **Note:** Working evidence notes for Tasks 17–18 only (not `docs/knowledgehub/outcomes/P02.md` acceptance sign-off).

## Task 17 — Live Gateway, Roles, and Persistence Summary

| Check | Result | Observed Evidence (redacted) |
| --- | --- | --- |
| `/alive` & `/health` (`KnowledgeHubService`) | PASS | `GET /alive` -> `200 {"status":"alive"}`; `GET /health` -> `200 {"status":"healthy"}` (RPC + PostgreSQL `SELECT 1`). |
| Real Gateway route `/knowledgehub` (`ProtectedRoute` + `MainLayout`) | PASS | `GET /api/knowledgehub/collections?page_index=1&page_size=50` via Gateway `https://localhost:7083` returned HTTP 200 `{Success: true, StatusCode: 200, TotalRow: 1}`. |
| Create -> URL `?c=<UUID>` -> Refresh -> Back/Forward | PASS | Disposable collection `29ee45f9-1f61-45bc-b37f-926d52933929` created (`DocumentCount: 0`); URL updated to `?c=29ee45f9-...`; survived reload; Back/Forward switched cleanly with `ba92c17f-...`. |
| Rename + fresh browser session persistence | PASS | `PUT /api/knowledgehub/collections/29ee45f9-...` returned HTTP 200 `{Success: true, StatusCode: 200}`; updated title remained visible in a new isolated browser session. |
| Soft delete + conditional URL cleanup + DB `deleted_at` | PASS | UI delete of `7a20e913-274d-414c-91b2-bd86a5aab866` removed `c` from URL; `GET` and repeat `DELETE` returned `{Success: false, StatusCode: 404}`; direct `/knowledgehub?c=29ee45f9-...` rendered `"unavailable"`; read-only PostgreSQL check confirmed `deleted_at IS NOT NULL` while rows persisted. |
| Missing/invalid JWT & invalid/zero UUID | PASS | Missing/invalid JWT via Gateway -> `{Success: false, StatusCode: 401}`; zero UUID `GET` -> `{Success: false, StatusCode: 400}`; random missing UUID -> `{Success: false, StatusCode: 404}`. |
| Sidebar menu visibility (`IsShowMenu`) | PASS | Authorized `PUT /System/Menu/update` set `IsShowMenu=true` on menu `4b14c8da-d991-407d-846d-f2ca0f5b8bbd`; after re-auth, `KnowledgeHub` appeared under `PLUGIN` in sidebar and navigated to `/knowledgehub` (see `P02-1280-sidebar-menu-enabled.png`). |
| Two-actor isolation (`Actor B` vs `Actor A` & no admin bypass) | PASS | Temporary test actor `kh_actor_b_a23a22` (`36dc60a2-...`) saw `TotalRow=0`, received `404` on `GET`/`PUT`/`DELETE` of `admin`'s `1f2d818c-...`, and saw unavailable UI at `?c=1f2d818c-...`. `admin` likewise received `404` and unavailable UI on `kh_actor_b_a23a22`'s `99cc9003-...`. |
| Restricted role `VIEW+ADD` only (`Actor C`) | PASS | Temporary test actor `kh_actor_c_a23a22` (`ff60caa1-...`) created `colC` (`StatusCode: 200`), UI hid `Đổi tên` and `Xóa`, and direct `PUT`/`DELETE` returned `{Success: false, StatusCode: 403}`. |
| No `knowledgehub` grant (`Actor D`) | PASS | Temporary test actor `kh_actor_d_a23a22` (`1f57612a-...`, all KnowledgeHub role flags `false`): `/knowledgehub` redirected to `/unauthorized`, and `GET` list / `POST` create / `GET` detail all returned `{Success: false, StatusCode: 403}` (note: SystemService `Menu/get-list-by-user` still lists `PLUGIN`/`KnowledgeHub` when `IsShowMenu=true`, but route + API fail closed). Temporary test users/roles and disposable collections were cleaned up after verification. |

## Task 18 — Screenshots & Visual Deviation Log

Reference baseline: `docs/knowledgehub/references/stitch_blocks_interface/screen.png` (`1280x1024` intrinsic pixels).

| Screenshot | Viewport | URL shape / UI state | Overflow (`scrollWidth > innerWidth`) |
| --- | --- | --- | --- |
| `P02-1280-unselected-repository.png` | `1280x1024` | `/knowledgehub`, dropdown closed, repository tab active, no auto-select | `false` (`1280 / 1280`) |
| `P02-1280-selected-selector-open.png` | `1280x1024` | `/knowledgehub?c=<uuid>`, selector popover open, badge `0 tài liệu` inline right of selector | `false` (`1280 / 1280`) |
| `P02-1280-research-unavailable.png` | `1280x1024` | `/knowledgehub?c=<uuid>`, Ask & Research tab active, disabled unavailable frame | `false` (`1280 / 1280`) |
| `P02-1440-dialog-create.png` | `1440x900` | `/knowledgehub`, `Tạo bộ sưu tập` modal open with Vietnamese labels and input | `false` (`1440 / 1440`) |
| `P02-1440-dialog-delete-error.png` | `1440x900` | `/knowledgehub?c=<uuid>`, `Xác nhận xóa bộ sưu tập` modal preserving real server 404 error (`role="alert"`) | `false` (`1440 / 1440`) |
| `P02-390-mobile-long-name.png` | `390x844` | `/knowledgehub?c=<uuid>`, long Unicode name truncated, badge & actions wrapped, tabs non-overlapping | `false` (`390 / 390`) |
| `P02-1280-sidebar-menu-enabled.png` | `1280x1024` | `/knowledgehub` after enabling `IsShowMenu=true` and re-authenticating; `PLUGIN -> KnowledgeHub` visible and active in sidebar | `false` (`1280 / 1280`) |

### Visual Deviation Log

| Region / viewport | Mockup expectation | Actual screenshot | Difference classification | Action |
| --- | --- | --- | --- | --- |
| Global shell (`1280` / `1440`) | Prototype static sidebar (`TradeLab`, `AI Video Production`, fixed header search) | Existing Blocks `MainLayout` (`Blocks Studio`, `TỔNG QUAN`, `PLUGIN`, `QUẢN TRỊ DANH MỤC & TÍCH HỢP`, `HỆ THỐNG`) | Shell (intentional reuse) | Keep existing Blocks shell unchanged; `knowledgehub` sidebar link awaits `IsShowMenu=true`. |
| Header `1280` | Selector left of count badge (`4 tài liệu`) + no rename/delete buttons in static mockup | Selector left of real `0 tài liệu` badge (`inline_right: true`); `Đổi tên` and `Xóa` buttons on the right | Intentional P02 (real DTO count + CRUD management) | Fixed `KnowledgeHubPage.tsx` wrapper from `flex-col` to `flex-wrap items-center` to match mockup inline badge placement. |
| Popover `1280` | Dropdown below title showing collection list + `"Tạo bộ sưu tập mới"`, fake `12 files` counts | Dropdown below selector with UUID 8-char fragments (`29ee45f9`, `ba92c17f`), search input, and `Tạo bộ sưu tập mới` | Intentional P02 (UUID-safe disambiguation, no fake file counts) | Verified against duplicate-name & keyboard Escape rules. |
| Repository `1280` | Active upload drop-zone, fake document table (`Clean Architecture.pdf`, `72%`) | Disabled P03 upload card (`Tải tài liệu (chưa khả dụng)`) + empty document card (`Chưa có tài liệu trong bộ sưu tập này.`) | Intentional P02 disabled functionality | Verified honest P02 messaging and zero fake files. |
| Research `1280` / `1440` | Populated AI chat/citations in `code.html` | Disabled P03+ placeholder card (`Bắt đầu hỏi đáp (chưa khả dụng)`) | Intentional P02 disabled functionality | Verified no fabricated AI answers, models, or citations. |
| Mobile `390` | Readable stacked layout without overflow or clipping | Initial capture showed wrapped `TabsTrigger` (`h-[calc(100%-1px)]`) overlapping `RepositoryFrame`; fixed locally in `KnowledgeHubPage.tsx` (`h-auto flex-initial py-1.5`) and re-captured | Bug fixed (`tabs_list_bottom: 296`, `tabs_content_top: 312`, `overlaps: false`) | Re-captured `P02-390-mobile-long-name.png`; `scrollWidth === 390`. |

### Keyboard & Focus Checks

- `Tab` inside `CollectionFormDialog` keeps focus within `[role="dialog"]`.
- `Escape` closes `CollectionSelector` popover (`aria-expanded="false"`).
- `Escape` closes `CollectionDeleteDialog` and returns focus to the `"Xóa"` trigger button.
