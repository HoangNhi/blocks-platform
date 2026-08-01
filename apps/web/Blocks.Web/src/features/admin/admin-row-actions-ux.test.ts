import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const pageFiles = [
  "users-page.tsx",
  "roles-page.tsx",
  "menus-page.tsx",
  "system-groups-page.tsx",
]

describe("admin row action UX", () => {
  it.each(pageFiles)("does not expose technical IDs in %s row action dropdowns", (fileName) => {
    const source = readFileSync(resolve(__dirname, "pages", fileName), "utf8")

    expect(source).not.toMatch(/Mã:\s*\{item\.id\}/)
    expect(source).not.toMatch(/MÃ£:\s*\{item\.id\}/)
  })
})
