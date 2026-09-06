export type SelectionState = {
  selectedIds: string[]
  onSelectedIdsChange: (nextIds: string[]) => void
}

export function toggleSelectedId(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((currentId) => currentId !== id)
    : [...selectedIds, id]
}

export function toggleAllSelectedIds(selectedIds: string[], visibleIds: string[]): string[] {
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((visibleId) => selectedIds.includes(visibleId))
  return allVisibleSelected
    ? selectedIds.filter((selectedId) => !visibleIds.includes(selectedId))
    : Array.from(new Set([...selectedIds, ...visibleIds]))
}

export function areAllVisibleSelected(selectedIds: string[], visibleIds: string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((visibleId) => selectedIds.includes(visibleId))
}
