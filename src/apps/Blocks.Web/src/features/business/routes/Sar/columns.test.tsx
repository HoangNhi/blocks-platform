import { describe, expect, it, vi } from "vitest";
import { getColumns } from "./columns";

describe("Sar columns", () => {
  it("keeps the view action available in read-only mode", () => {
    const columns = getColumns(vi.fn(), true);

    expect(columns.some((column) => column.id === "actions")).toBe(true);
  });
});
