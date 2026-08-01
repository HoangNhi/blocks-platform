export type EntityDialogMode = "create" | "edit" | "detail"

export type EntityDialogSubmitIntent = "save" | "saveAndAddMore"

export type EntityDialogState = {
  isOpen: boolean
  mode: EntityDialogMode | null
  entityId: string | null
  submitIntent: EntityDialogSubmitIntent | null
}

export function openCreateDialog(): EntityDialogState {
  return {
    isOpen: true,
    mode: "create",
    entityId: null,
    submitIntent: "save",
  }
}

export function openEditDialog(entityId: string): EntityDialogState {
  return {
    isOpen: true,
    mode: "edit",
    entityId,
    submitIntent: "save",
  }
}

export function openDetailDialog(entityId: string): EntityDialogState {
  return {
    isOpen: true,
    mode: "detail",
    entityId,
    submitIntent: null,
  }
}

export function closeDialogState(): EntityDialogState {
  return {
    isOpen: false,
    mode: null,
    entityId: null,
    submitIntent: null,
  }
}

export function resetSubmitIntent(
  state: EntityDialogState,
): EntityDialogState {
  return {
    ...state,
    submitIntent: null,
  }
}

export function canUseSaveAndAddMore(mode: EntityDialogMode | null) {
  return mode === "create"
}
