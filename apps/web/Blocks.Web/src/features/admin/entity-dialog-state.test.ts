import { describe, expect, it } from "vitest"

import {
  canUseSaveAndAddMore,
  closeDialogState,
  openCreateDialog,
  openDetailDialog,
  openEditDialog,
  resetSubmitIntent,
} from "./entity-dialog-state"

describe("entity dialog state", () => {
  it("opens create mode with save as the default submit intent", () => {
    expect(openCreateDialog()).toEqual({
      isOpen: true,
      mode: "create",
      entityId: null,
      submitIntent: "save",
    })
  })

  it("opens edit mode for a selected entity id", () => {
    expect(openEditDialog("entity-1")).toEqual({
      isOpen: true,
      mode: "edit",
      entityId: "entity-1",
      submitIntent: "save",
    })
  })

  it("opens detail mode without a submit intent", () => {
    expect(openDetailDialog("entity-1")).toEqual({
      isOpen: true,
      mode: "detail",
      entityId: "entity-1",
      submitIntent: null,
    })
  })

  it("resets submit intent when the dialog closes", () => {
    expect(
      closeDialogState(),
    ).toEqual({
      isOpen: false,
      mode: null,
      entityId: null,
      submitIntent: null,
    })

    expect(
      resetSubmitIntent({
        isOpen: true,
        mode: "create",
        entityId: "entity-1",
        submitIntent: "saveAndAddMore",
      }),
    ).toEqual({
      isOpen: true,
      mode: "create",
      entityId: "entity-1",
      submitIntent: null,
    })
  })

  it("allows save and add more only in create mode", () => {
    expect(canUseSaveAndAddMore("create")).toBe(true)
    expect(canUseSaveAndAddMore("edit")).toBe(false)
    expect(canUseSaveAndAddMore("detail")).toBe(false)
    expect(canUseSaveAndAddMore(null)).toBe(false)
  })
})
