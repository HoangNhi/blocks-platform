// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssistantDrawer } from "./assistant-drawer";
import type { AssistantApi } from "./assistant-api";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const tradelabContext = {
  route: "/plugins/tradelab",
  title: "Strategy Lab",
  ownerKey: "tradelab",
};

describe("AssistantDrawer", () => {
  it("shows a thinking state and accumulates streamed chunks", async () => {
    const actor = userEvent.setup();
    let triggerChunks!: () => void;
    const streamMessage: AssistantApi["streamChat"] = vi.fn(async (_request, handlers) => {
      handlers.onStart?.({ event: "start", scope: "tradelab", mode: "ollama_chat" });
      triggerChunks = () => {
        handlers.onChunk?.({ event: "chunk", content: "I can help explain " });
        handlers.onChunk?.({ event: "chunk", content: "Strategy Lab." });
        handlers.onComplete?.({ event: "complete", suggestions: [] });
      };
    });

    render(
      <AssistantDrawer
        open
        onOpenChange={vi.fn()}
        pageContext={tradelabContext}
        streamMessage={streamMessage}
      />,
    );

    await actor.click(screen.getByRole("button", { name: "Explain this page" }));

    expect(screen.getByText("Thinking...")).toBeTruthy();

    triggerChunks();

    expect(await screen.findByText("I can help explain Strategy Lab.")).toBeTruthy();
  });

  it("shows outside-TradeLab boundary copy", () => {
    render(
      <AssistantDrawer
        open
        onOpenChange={vi.fn()}
        pageContext={{ route: "/system/identity/users", title: "Users", ownerKey: "system-service" }}
        streamMessage={vi.fn()}
      />,
    );

    expect(screen.getByText(/TradeLab is the first supported assistant scope/)).toBeTruthy();
  });

  it("shows a safe stream error with retry", async () => {
    const actor = userEvent.setup();
    const streamMessage: AssistantApi["streamChat"] = vi.fn(async (_request, handlers) => {
      handlers.onStart?.({ event: "start", scope: "tradelab", mode: "ollama_chat" });
      handlers.onError?.({ event: "error", message: "Assistant model is unavailable." });
    });

    render(
      <AssistantDrawer
        open
        onOpenChange={vi.fn()}
        pageContext={tradelabContext}
        streamMessage={streamMessage}
      />,
    );

    await actor.click(screen.getByRole("button", { name: "Explain this page" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Assistant model is unavailable.")).toBeTruthy();
    expect(within(alert).getByRole("button", { name: "Retry message" })).toBeTruthy();
  });
});
