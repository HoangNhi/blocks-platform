import { describe, expect, it, vi } from "vitest";

import { createAssistantApi } from "./assistant-api";

function streamResponse(frames: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

describe("Assistant API client", () => {
  it("posts to the canonical chat route and dispatches stream callbacks", async () => {
    const fetcher = vi.fn(async () =>
      streamResponse([
        'event: start\ndata: {"event":"start","scope":"tradelab","mode":"ollama_chat"}\n\n',
        'event: chunk\ndata: {"event":"chunk","content":"Hello"}\n\n',
        'event: complete\ndata: {"event":"complete","suggestions":[]}\n\n',
      ]),
    );

    const onStart = vi.fn();
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const api = createAssistantApi({
      baseUrl: "http://localhost:5000",
      getAccessToken: () => "token-123",
      fetcher,
    });

    await api.streamChat(
      {
        scope: "tradelab",
        message: "Explain this page",
        pageContext: {
          route: "/plugins/tradelab",
          title: "Strategy Lab",
          ownerKey: "tradelab",
        },
      },
      { onStart, onChunk, onComplete },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:5000/api/assistant/chat");
    expect(init.method).toBe("POST");
    expect(init.headers ? (init.headers as Record<string, string>).Accept : "").toBe("text/event-stream");
    expect(init.headers ? (init.headers as Record<string, string>).Authorization : "").toBe("Bearer token-123");
    expect(onStart).toHaveBeenCalledWith({
      event: "start",
      scope: "tradelab",
      mode: "ollama_chat",
    });
    expect(onChunk).toHaveBeenCalledWith({
      event: "chunk",
      content: "Hello",
    });
    expect(onComplete).toHaveBeenCalledWith({
      event: "complete",
      suggestions: [],
    });
  });
});
