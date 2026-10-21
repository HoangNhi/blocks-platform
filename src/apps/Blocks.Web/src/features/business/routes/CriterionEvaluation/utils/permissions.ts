export function canEvaluatorSubmit(
  roleId: number,
  assignedStandardIds: Iterable<string> | null | undefined,
  activeStandardId: string | null | undefined,
): boolean {
  if (roleId !== 4) return false;
  if (!activeStandardId) return false;

  return new Set(assignedStandardIds ?? []).has(activeStandardId);
}
