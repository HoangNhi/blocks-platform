export type AssistantStartEvent = {
  event: "start";
  scope: "tradelab";
  mode: "ollama_chat";
};

export type AssistantChunkEvent = {
  event: "chunk";
  content: string;
};

export type AssistantCompleteEvent = {
  event: "complete";
  suggestions: string[];
};

export type AssistantErrorEvent = {
  event: "error";
  message: string;
};

export type AssistantStreamEvent =
  | AssistantStartEvent
  | AssistantChunkEvent
  | AssistantCompleteEvent
  | AssistantErrorEvent;

export function parseAssistantStreamBuffer(input: string): {
  events: AssistantStreamEvent[];
  remainder: string;
} {
  const frames = input.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: AssistantStreamEvent[] = [];

  for (const frame of frames) {
    const eventLine = frame
      .split("\n")
      .find((line) => line.startsWith("event: "));
    const dataLine = frame
      .split("\n")
      .find((line) => line.startsWith("data: "));

    if (!eventLine || !dataLine) continue;

    const payload = JSON.parse(
      dataLine.slice("data: ".length),
    ) as AssistantStreamEvent;
    const eventName = eventLine.slice("event: ".length);

    if (payload.event === eventName) {
      events.push(payload);
    }
  }

  return { events, remainder };
}
