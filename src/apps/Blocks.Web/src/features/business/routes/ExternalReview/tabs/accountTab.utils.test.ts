import { describe, expect, it } from "vitest";
import { getSelectedAccountIds, summarizeBulkDelete } from "./accountTab.utils";

describe("getSelectedAccountIds", () => {
  it("maps selected row indexes to account ids on the current page", () => {
    const pageData = [{ Id: "a1" }, { Id: "a2" }, { Id: "a3" }];
    const rowSelection = { 0: true, 2: true };

    expect(getSelectedAccountIds(pageData, rowSelection)).toEqual(["a1", "a3"]);
  });
});

describe("summarizeBulkDelete", () => {
  it("returns success and failure counts from settled results", () => {
    const summary = summarizeBulkDelete([
      { status: "fulfilled" },
      { status: "rejected" },
      { status: "fulfilled" },
    ] as PromiseSettledResult<unknown>[]);

    expect(summary).toEqual({ successCount: 2, failedCount: 1 });
  });
});
