import { describe, expect, it } from "vitest";
import { collectionKeys } from "./collection-query-keys";

describe("KnowledgeHub private query keys", () => {
  it("separates two actors and two collection ids", () => {
    expect(collectionKeys.lists("A")).not.toEqual(collectionKeys.lists("B"));
    expect(collectionKeys.detail("A", "one")).not.toEqual(
      collectionKeys.detail("A", "two")
    );
    expect(collectionKeys.lists("A")[0]).toBe("knowledgehub");
  });

  it("defines root, actor and list keys correctly", () => {
    expect(collectionKeys.all).toEqual(["knowledgehub"]);
    expect(collectionKeys.actor("actor-123")).toEqual(["knowledgehub", "actor-123"]);
    expect(collectionKeys.lists("actor-123")).toEqual(["knowledgehub", "actor-123", "collections"]);
    expect(collectionKeys.detail("actor-123", "col-456")).toEqual([
      "knowledgehub",
      "actor-123",
      "detail",
      "col-456",
    ]);
  });
});
