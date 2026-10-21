import { describe, expect, it } from "vitest";
import { applyCommentMarkVisualState } from "./commentEditorUtils";

function createEditorDom(): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = `
    <p>
      <span data-comment-id="c1">one</span>
      <span data-comment-id="c1">two</span>
      <span data-comment-id="c2">three</span>
    </p>
  `;
  return container;
}

describe("applyCommentMarkVisualState", () => {
  it("applies active style to all matching marks", () => {
    const editorDom = createEditorDom();

    applyCommentMarkVisualState(editorDom, "c1");

    const activeMarks = editorDom.querySelectorAll<HTMLElement>('span[data-comment-id="c1"]');
    expect(activeMarks).toHaveLength(2);
    activeMarks.forEach((mark) => {
      expect(mark.style.backgroundColor).toBe("rgb(252, 211, 77)");
      expect(mark.style.boxShadow).toContain("rgb(245 158 11)");
    });
  });

  it("does not style non-active marks", () => {
    const editorDom = createEditorDom();

    applyCommentMarkVisualState(editorDom, "c1");

    const inactiveMark = editorDom.querySelector<HTMLElement>('span[data-comment-id="c2"]');
    expect(inactiveMark?.style.backgroundColor).toBe("");
    expect(inactiveMark?.style.boxShadow).toBe("");
  });

  it("resets stale inline styles when there is no active mark", () => {
    const editorDom = createEditorDom();
    const mark = editorDom.querySelector<HTMLElement>('span[data-comment-id="c1"]');
    if (!mark) {
      throw new Error("Expected mark to exist");
    }
    mark.style.backgroundColor = "rgb(0, 0, 0)";
    mark.style.boxShadow = "0 0 0 2px rgb(255, 255, 255)";

    applyCommentMarkVisualState(editorDom, null);

    expect(mark.style.backgroundColor).toBe("");
    expect(mark.style.boxShadow).toBe("");
  });
});
