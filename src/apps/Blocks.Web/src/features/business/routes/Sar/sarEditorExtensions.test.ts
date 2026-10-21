import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createSarEditorExtensions } from "./sarEditorExtensions";

describe("createSarEditorExtensions", () => {
  it("always returns a non-empty extension list so editor schema has top nodes", () => {
    const extensions = createSarEditorExtensions(null);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it("adds collaboration extension when ydoc is available", () => {
    const extensions = createSarEditorExtensions(new Y.Doc());
    expect(extensions.some((extension) => extension.name === "collaboration")).toBe(true);
  });

  it("keeps comment marks in the schema so collaboration does not strip them", () => {
    const extensions = createSarEditorExtensions(new Y.Doc());
    expect(extensions.some((extension) => extension.name === "comment")).toBe(true);
  });

  it("wires the comment activation callback into the comment extension", () => {
    const onCommentActivated = vi.fn();

    const extensions = createSarEditorExtensions(
      null,
      null,
      undefined,
      undefined,
      { onCommentActivated },
    );

    const commentExtension = extensions.find((extension) => extension.name === "comment");
    const commentOptions = (commentExtension?.options ?? {}) as {
      onCommentActivated?: typeof onCommentActivated;
    };

    expect(commentOptions.onCommentActivated).toBe(onCommentActivated);
  });
});
