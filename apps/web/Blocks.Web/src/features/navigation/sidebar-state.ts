export function toggleOpenSubgroup(openIds: string[], id: string): string[] {
  if (openIds.includes(id)) {
    return openIds.filter((openId) => openId !== id)
  }

  return [...openIds, id]
}

export function ensureOpenSubgroups(
  openIds: string[],
  requiredIds: string[],
): string[] {
  return [...new Set([...openIds, ...requiredIds])]
}
