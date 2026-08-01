/// <reference types="node" />

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const sourceDir = dirname(fileURLToPath(import.meta.url))
const configSource = readFileSync(resolve(sourceDir, "../vite.config.ts"), "utf8")

describe("Vite bundle split config", () => {
  it("uses Rolldown manual chunks for heavy lazy-route dependencies", () => {
    expect(configSource).toContain("rolldownOptions")
    expect(configSource).toContain("manualChunks: chunkGroupForModule")
    expect(configSource).toContain("@uiw/react-codemirror")
    expect(configSource).toContain("@codemirror")
    expect(configSource).toContain("lightweight-charts")
    expect(configSource).toContain("react-virtuoso")
    expect(configSource).toContain("/src/plugins/tradelab/")
    expect(configSource).not.toContain("chunkSizeWarningLimit")
  })
})
