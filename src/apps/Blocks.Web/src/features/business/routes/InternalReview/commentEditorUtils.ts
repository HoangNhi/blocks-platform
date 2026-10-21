import type { Editor } from "@tiptap/react";

function normalizeWhitespace(text: string): string {
  return text
    .trim()
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ");
}

type TextNodeEntry = {
  text: string;
  pos: number;
  parent: unknown;
};

function buildSearchableText(entries: TextNodeEntry[]): {
  text: string;
  positions: number[];
} {
  const rawCharacters: string[] = [];
  const positions: number[] = [];

  let previousParent: unknown = null;
  let previousWasWhitespace = true;

  entries.forEach((entry, index) => {
    const parentChanged = index > 0 && entry.parent !== previousParent;
    if (parentChanged && !previousWasWhitespace) {
      rawCharacters.push(" ");
      positions.push(entry.pos);
      previousWasWhitespace = true;
    }

    for (let charIndex = 0; charIndex < entry.text.length; charIndex += 1) {
      const char = entry.text[charIndex];
      const isWhitespace = /\s/.test(char);

      if (isWhitespace) {
        if (previousWasWhitespace) {
          continue;
        }

        rawCharacters.push(" ");
        positions.push(entry.pos + charIndex);
        previousWasWhitespace = true;
        continue;
      }

      rawCharacters.push(char.toLowerCase());
      positions.push(entry.pos + charIndex);
      previousWasWhitespace = false;
    }

    previousParent = entry.parent;
  });

  let startIndex = 0;
  while (startIndex < rawCharacters.length && rawCharacters[startIndex] === " ") {
    startIndex += 1;
  }

  let endIndex = rawCharacters.length;
  while (endIndex > startIndex && rawCharacters[endIndex - 1] === " ") {
    endIndex -= 1;
  }

  return {
    text: rawCharacters.slice(startIndex, endIndex).join(""),
    positions: positions.slice(startIndex, endIndex),
  };
}

export function findTextRange(
  editor: Editor,
  text: string,
): { from: number; to: number } | null {
  const normalizedSearchText = normalizeWhitespace(text).toLowerCase();
  if (!normalizedSearchText) {
    return null;
  }

  const textEntries: TextNodeEntry[] = [];
  editor.state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) {
      return true;
    }

    textEntries.push({
      text: node.text,
      pos,
      parent,
    });

    return true;
  });

  if (textEntries.length === 0) {
    return null;
  }

  const searchableText = buildSearchableText(textEntries);
  const searchIndex = searchableText.text.indexOf(normalizedSearchText);
  if (searchIndex < 0) {
    return null;
  }

  const fromPosition = searchableText.positions[searchIndex];
  const toPosition = searchableText.positions[searchIndex + normalizedSearchText.length - 1];

  if (fromPosition === undefined || toPosition === undefined) {
    return null;
  }

  return {
    from: fromPosition,
    to: toPosition + 1,
  };
}

export function hasCommentMarkById(editor: Editor, commentId: string): boolean {
  let found = false;

  editor.state.doc.descendants((node) => {
    if (found) {
      return false;
    }

    found = node.marks.some(
      (mark) => mark.type.name === "comment" && mark.attrs.commentId === commentId,
    );

    return !found;
  });

  return found;
}

export function findMarkRange(
  editor: Editor,
  commentId: string,
): { from: number; to: number } | null {
  let from: number | null = null;
  let to: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const hasMark = node.marks.some(
      (mark) => mark.type.name === "comment" && mark.attrs.commentId === commentId,
    );

    if (!hasMark) {
      return true;
    }

    if (from === null) {
      from = pos;
    }

    to = pos + node.nodeSize;

    return true;
  });

  if (from === null || to === null) {
    return null;
  }

  return { from, to };
}

export function applyCommentMarkVisualState(
  editorDom: HTMLElement,
  activeCommentId: string | null,
): void {
  const allMarks = editorDom.querySelectorAll<HTMLElement>("span[data-comment-id]");
  allMarks.forEach((element) => {
    element.style.backgroundColor = "";
    element.style.boxShadow = "";
  });

  if (!activeCommentId) {
    return;
  }

  const escapedCommentId =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(activeCommentId)
      : null;

  const activeMarks: HTMLElement[] = escapedCommentId
    ? Array.from(
        editorDom.querySelectorAll<HTMLElement>(`span[data-comment-id="${escapedCommentId}"]`),
      )
    : Array.from(editorDom.querySelectorAll<HTMLElement>("span[data-comment-id]")).filter(
        (candidate) => candidate.getAttribute("data-comment-id") === activeCommentId,
      );

  activeMarks.forEach((element) => {
    element.style.backgroundColor = "rgb(252 211 77)";
    element.style.boxShadow = "0 0 0 2px rgb(245 158 11)";
  });
}
