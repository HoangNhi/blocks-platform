import { describe, expect, it } from "vitest"

import { ensureOpenSubgroups, toggleOpenSubgroup } from "./sidebar-state"

describe("sidebar multiple-expand state", () => {
  it("opens a subgroup without closing existing open subgroups", () => {
    expect(toggleOpenSubgroup(["identity"], "file-service")).toEqual([
      "identity",
      "file-service",
    ])
  })

  it("closes only the selected subgroup when it is already open", () => {
    expect(
      toggleOpenSubgroup(["system-core", "identity", "file-service"], "identity"),
    ).toEqual(["system-core", "file-service"])
  })

  it("keeps open ids stable and unique when syncing active route parents", () => {
    expect(
      ensureOpenSubgroups(["identity", "file-service"], [
        "identity",
        "plugin-launchpad",
      ]),
    ).toEqual(["identity", "file-service", "plugin-launchpad"])
  })
})
