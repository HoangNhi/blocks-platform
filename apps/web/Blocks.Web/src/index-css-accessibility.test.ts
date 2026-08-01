/// <reference types="node" />

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const sourceDir = dirname(fileURLToPath(import.meta.url))

describe("global accessibility styles", () => {
  it("does not remove focus outlines from all raw links and buttons", () => {
    const css = readFileSync(resolve(sourceDir, "index.css"), "utf8")

    expect(css).not.toMatch(/button,\s*a\s*\{[\s\S]*?outline-none/)
  })
})
