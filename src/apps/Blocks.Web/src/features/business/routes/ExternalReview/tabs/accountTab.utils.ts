export function getSelectedAccountIds<T extends { Id: string }>(
  pageData: T[],
  rowSelection: Record<string, boolean>,
): string[] {
  return pageData
    .filter((_, index) => rowSelection[index])
    .map((item) => item.Id);
}

export function summarizeBulkDelete(results: PromiseSettledResult<unknown>[]) {
  const successCount = results.filter((result) => result.status === "fulfilled").length;
  return {
    successCount,
    failedCount: results.length - successCount,
  };
}
