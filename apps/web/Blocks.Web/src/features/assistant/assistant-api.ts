import { parseAssistantStreamBuffer, type AssistantStreamEvent } from "./assistant-sse";

export type AssistantScope = "tradelab";

export type AssistantPageContext = {
  route?: string | null;
  title?: string | null;
  ownerKey?: string | null;
};

export type AssistantChatRequest = {
  scope: AssistantScope;
  message: string;
  pageContext?: AssistantPageContext | null;
};

export type AssistantStreamHandlers = {
  onStart?: (event: Extract<AssistantStreamEvent, { event: "start" }>) => void;
  onChunk?: (event: Extract<AssistantStreamEvent, { event: "chunk" }>) => void;
  onComplete?: (
    event: Extract<AssistantStreamEvent, { event: "complete" }>,
  ) => void;
  onError?: (event: Extract<AssistantStreamEvent, { event: "error" }>) => void;
};

type AssistantApiOptions = {
  baseUrl: string;
  getAccessToken: () => string | null;
  fetcher?: typeof fetch;
};

export type AssistantApi = {
  streamChat: (
    request: AssistantChatRequest,
    handlers: AssistantStreamHandlers,
  ) => Promise<void>;
};

function buildUrl(baseUrl: string, path: string) {
  const absoluteBaseUrl = /^https?:\/\//i.test(baseUrl)
    ? baseUrl
    : new URL(
        baseUrl,
        globalThis.location?.origin ?? "http://127.0.0.1",
      ).toString();
  const normalizedBaseUrl = absoluteBaseUrl.endsWith("/")
    ? absoluteBaseUrl
    : `${absoluteBaseUrl}/`;

  return new URL(path.replace(/^\//, ""), normalizedBaseUrl).toString();
}

export function createAssistantApi({
  baseUrl,
  getAccessToken,
  fetcher = fetch,
}: AssistantApiOptions): AssistantApi {
  return {
    async streamChat(body, handlers) {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      };

      const token = getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetcher(buildUrl(baseUrl, "/api/assistant/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const contentType = response.headers.get("Content-Type") ?? "";
      if (!response.ok || !contentType.includes("text/event-stream")) {
        throw new Error("Assistant stream failed.");
      }

      if (!response.body) {
        throw new Error("Assistant stream body missing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let remainder = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        remainder += decoder.decode(value, { stream: true });
        const parsed = parseAssistantStreamBuffer(remainder);
        remainder = parsed.remainder;

        for (const event of parsed.events) {
          if (event.event === "start") handlers.onStart?.(event);
          if (event.event === "chunk") handlers.onChunk?.(event);
          if (event.event === "complete") handlers.onComplete?.(event);
          if (event.event === "error") handlers.onError?.(event);
        }
      }
    },
  };
}
