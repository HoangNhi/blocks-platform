/// <reference types="node" />

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(resolve(sourceDir, "App.tsx"), "utf8")

describe("App route bundle boundaries", () => {
  it("renders public auth pages through top-level routes", () => {
    expect(appSource).toContain('import { LoginPage } from "@/features/auth/login-page"')
    expect(appSource).toContain('import { RegistrationPage } from "@/features/auth/registration-page"')
    expect(appSource).toContain('<Route path="/login" element={<LoginPage />} />')
    expect(appSource).toContain('<Route path="/register" element={<RegistrationPage />} />')
    expect(appSource).not.toContain('element={<AuthEntryRouter />}')
  })

  it("keeps heavy route pages behind lazy imports", () => {
    const eagerRouteImports = [
      /import\s+\{\s*PluginReadinessPage\s*\}\s+from\s+"@\/features\/plugins\/plugin-readiness-page"/,
      /import\s+\{\s*AuditLogPage\s*\}\s+from\s+"@\/features\/admin\/pages\/audit-log-page"/,
      /import\s+\{\s*MenusPage\s*\}\s+from\s+"@\/features\/admin\/pages\/menus-page"/,
      /import\s+\{\s*RolesPage\s*\}\s+from\s+"@\/features\/admin\/pages\/roles-page"/,
      /import\s+\{\s*SystemGroupsPage\s*\}\s+from\s+"@\/features\/admin\/pages\/system-groups-page"/,
      /import\s+\{\s*UsersPage\s*\}\s+from\s+"@\/features\/admin\/pages\/users-page"/,
      /import\s+\{\s*StrategyLabPage\s*\}\s+from\s+"@\/plugins\/tradelab\/pages\/strategy-lab-page"/,
      /import\s+\{\s*AiVideoOperationsPage\s*\}\s+from\s+"@\/plugins\/ai-video-production\/pages\/ai-video-operations-page"/,
      /import\s+\{\s*AiVideoRunDetailPage\s*\}\s+from\s+"@\/plugins\/ai-video-production\/pages\/ai-video-run-detail-page"/,
    ]

    for (const eagerImport of eagerRouteImports) {
      expect(appSource).not.toMatch(eagerImport)
    }

    expect(appSource).toMatch(/const StrategyLabPage = lazy\(\(\) =>\s+import\("@\/plugins\/tradelab\/pages\/strategy-lab-page"\)/)
    expect(appSource).toMatch(/const AiVideoOperationsPage = lazy\(\(\) =>\s+import\("@\/plugins\/ai-video-production\/pages\/ai-video-operations-page"\)/)
    expect(appSource).toMatch(/const AiVideoRunDetailPage = lazy\(\(\) =>\s+import\("@\/plugins\/ai-video-production\/pages\/ai-video-run-detail-page"\)/)
    expect(appSource).toMatch(/const AuditLogPage = lazy\(\(\) =>\s+import\("@\/features\/admin\/pages\/audit-log-page"\)/)

    expect(appSource).toContain("<Suspense fallback={<RouteLoadingState />}>")
    expect(appSource).toContain("Đang tải trang")
    expect(appSource).toContain("Đang tải nội dung tuyến vừa chọn.")
  })
})
