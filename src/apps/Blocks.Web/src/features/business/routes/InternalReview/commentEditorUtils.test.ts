import type { Editor } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import {
  findMarkRange,
  findTextRange,
  hasCommentMarkById,
} from "./commentEditorUtils";

type FakeMark = {
  type: { name: string };
  attrs: Record<string, unknown>;
};

type FakeTextNode = {
  isText: true;
  text: string;
  marks?: FakeMark[];
  nodeSize?: number;
};

type FakeDescendant = {
  node: FakeTextNode;
  pos: number;
  parent?: object | null;
};

function createEditor(descendants: FakeDescendant[]) {
  return {
    state: {
      doc: {
        descendants(
          callback: (
            node: FakeTextNode & { marks: FakeMark[]; nodeSize: number },
            pos: number,
            parent?: object | null,
          ) => boolean | void,
        ) {
          descendants.forEach(({ node, pos, parent }) => {
            callback(
              {
                ...node,
                marks: node.marks ?? [],
                nodeSize: node.nodeSize ?? node.text.length,
              },
              pos,
              parent ?? null,
            );
          });
        },
      },
    },
  } as unknown as Editor;
}

describe("findTextRange", () => {
  it("returns null for empty text", () => {
    const editor = createEditor([{ node: { isText: true, text: "Hello" }, pos: 0 }]);

    expect(findTextRange(editor, "")).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    const editor = createEditor([{ node: { isText: true, text: "Hello" }, pos: 0 }]);

    expect(findTextRange(editor, "   ")).toBeNull();
  });

  it("finds text case-insensitively", () => {
    const editor = createEditor([
      { node: { isText: true, text: "Intro" }, pos: 0 },
      { node: { isText: true, text: "Target text" }, pos: 6 },
    ]);

    expect(findTextRange(editor, "target")).toEqual({ from: 6, to: 12 });
  });

  it("returns the first matching range", () => {
    const editor = createEditor([
      { node: { isText: true, text: "Match here" }, pos: 0 },
      { node: { isText: true, text: "Match here too" }, pos: 20 },
    ]);

    expect(findTextRange(editor, "Match")).toEqual({ from: 0, to: 5 });
  });

  it("returns null when no match exists", () => {
    const editor = createEditor([
      { node: { isText: true, text: "Alpha" }, pos: 0 },
      { node: { isText: true, text: "Beta" }, pos: 10 },
    ]);

    expect(findTextRange(editor, "Gamma")).toBeNull();
  });

  it("finds text across paragraph boundaries", () => {
    const firstParagraph = { type: { isBlock: true } };
    const secondParagraph = { type: { isBlock: true } };

    const editor = createEditor([
      { node: { isText: true, text: "Paragraph one" }, pos: 0, parent: firstParagraph },
      { node: { isText: true, text: "Paragraph two" }, pos: 20, parent: secondParagraph },
    ]);

    expect(findTextRange(editor, "one paragraph two")).toEqual({ from: 10, to: 33 });
  });
});

describe("hasCommentMarkById", () => {
  it("returns true when a comment mark with the matching id exists", () => {
    const editor = createEditor([
      {
        node: {
          isText: true,
          text: "Hello",
          marks: [{ type: { name: "comment" }, attrs: { commentId: "mark-1" } }],
        },
        pos: 0,
      },
    ]);

    expect(hasCommentMarkById(editor, "mark-1")).toBe(true);
  });

  it("returns false when the document has no comment marks", () => {
    const editor = createEditor([{ node: { isText: true, text: "Hello" }, pos: 0 }]);

    expect(hasCommentMarkById(editor, "mark-1")).toBe(false);
  });

  it("returns false when the id does not match", () => {
    const editor = createEditor([
      {
        node: {
          isText: true,
          text: "Hello",
          marks: [{ type: { name: "comment" }, attrs: { commentId: "other" } }],
        },
        pos: 0,
      },
    ]);

    expect(hasCommentMarkById(editor, "mark-1")).toBe(false);
  });
});

describe("findMarkRange", () => {
  it("returns range for a single text node with matching mark", () => {
    const editor = createEditor([
      {
        node: {
          isText: true,
          text: "Hello",
          marks: [{ type: { name: "comment" }, attrs: { commentId: "mark-1" } }],
          nodeSize: 5,
        },
        pos: 10,
      },
    ]);

    expect(findMarkRange(editor, "mark-1")).toEqual({ from: 10, to: 15 });
  });

  it("returns combined range when the mark spans multiple text nodes", () => {
    const editor = createEditor([
      {
        node: {
          isText: true,
          text: "Hel",
          marks: [{ type: { name: "comment" }, attrs: { commentId: "mark-1" } }],
          nodeSize: 3,
        },
        pos: 5,
      },
      {
        node: {
          isText: true,
          text: "lo",
          marks: [{ type: { name: "comment" }, attrs: { commentId: "mark-1" } }],
          nodeSize: 2,
        },
        pos: 8,
      },
    ]);

    expect(findMarkRange(editor, "mark-1")).toEqual({ from: 5, to: 10 });
  });

  it("returns null when the mark is not found", () => {
    const editor = createEditor([{ node: { isText: true, text: "Hello" }, pos: 0 }]);

    expect(findMarkRange(editor, "missing")).toBeNull();
  });
});
