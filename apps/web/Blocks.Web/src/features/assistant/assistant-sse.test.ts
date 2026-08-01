import { describe, expect, it } from "vitest";

import { parseAssistantStreamBuffer } from "./assistant-sse";

describe("parseAssistantStreamBuffer", () => {
  it("parses complete event frames and preserves trailing remainder", () => {
    const input =
      'event: chunk\ndata: {"event":"chunk","content":"Hello"}\n\n' +
      'event: complete\ndata: {"event":"complete","suggestions":[]}\n\n' +
      'event: ch';

    const result = parseAssistantStreamBuffer(input);

    expect(result.events).toEqual([
      { event: "chunk", content: "Hello" },
      { event: "complete", suggestions: [] },
    ]);
    expect(result.remainder).toBe("event: ch");
  });
});
