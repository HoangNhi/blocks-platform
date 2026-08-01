import { AlertCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { AssistantApi, AssistantPageContext } from "./assistant-api";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AssistantDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageContext: AssistantPageContext;
  streamMessage: AssistantApi["streamChat"];
};

function createMessageId(role: AssistantMessage["role"]) {
  return `${crypto.randomUUID()}-${role}`;
}

const promptShortcuts = [
  "Explain this page",
  "Summarize paper readiness",
  "What can I do next?",
];

function useIsMobileDrawer() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 767px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function isTradeLabContext(pageContext: AssistantPageContext) {
  return (
    pageContext.ownerKey === "tradelab" ||
    Boolean(pageContext.route?.startsWith("/plugins/tradelab"))
  );
}

export function AssistantDrawer({
  open,
  onOpenChange,
  pageContext,
  streamMessage,
}: AssistantDrawerProps) {
  const isMobile = useIsMobileDrawer();
  const content = (
    <AssistantDrawerContent
      onClose={() => onOpenChange(false)}
      pageContext={pageContext}
      streamMessage={streamMessage}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full max-w-none flex-col p-0 sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>New AI chat</SheetTitle>
            <SheetDescription>TradeLab assistant drawer</SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <aside
      aria-label="AI assistant"
      className="hidden h-svh w-[420px] shrink-0 border-l bg-background text-foreground shadow-sm md:flex"
      role="complementary"
    >
      {content}
    </aside>
  );
}

function AssistantDrawerContent({
  onClose,
  pageContext,
  streamMessage,
}: {
  onClose: () => void;
  pageContext: AssistantPageContext;
  streamMessage: AssistantApi["streamChat"];
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(
    null,
  );
  const tradeLabContext = isTradeLabContext(pageContext);
  const canSend = draft.trim().length > 0 && !isSending;
  const helperCopy = tradeLabContext
    ? "Ask about current TradeLab page context, paper readiness, or safe local/dev next steps."
    : "TradeLab is the first supported assistant scope. Open Strategy Lab for page-specific help.";

  const scopeTitle = useMemo(
    () => pageContext.title ?? "Current page",
    [pageContext.title],
  );

  async function submitMessage(
    nextMessage: string,
    options: { repeatUserMessage?: boolean } = {},
  ) {
    const message = nextMessage.trim();
    if (!message || isSending) return;

    const repeatUserMessage = options.repeatUserMessage ?? true;
    const assistantId = createMessageId("assistant");

    setError(null);
    setIsSending(true);
    setDraft("");

    if (repeatUserMessage) {
      setMessages((current) => [
        ...current,
        { id: createMessageId("user"), role: "user", content: message },
      ]);
    }

    setMessages((current) => [
      ...current,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      await streamMessage(
        { scope: "tradelab", message, pageContext },
        {
          onChunk: (event) => {
            setMessages((current) =>
              current.map((entry) =>
                entry.id === assistantId
                  ? { ...entry, content: `${entry.content}${event.content}` }
                  : entry,
              ),
            );
          },
          onComplete: () => {
            setLastFailedMessage(null);
            setIsSending(false);
          },
          onError: (event) => {
            setLastFailedMessage(message);
            setError(event.message);
            setIsSending(false);
            setMessages((current) =>
              current.filter((entry) => entry.id !== assistantId),
            );
          },
        },
      );
    } catch (caught) {
      const messageText =
        caught instanceof Error ? caught.message : "Assistant request failed.";
      setLastFailedMessage(message);
      setError(messageText);
      setIsSending(false);
      setMessages((current) =>
        current.filter((entry) => entry.id !== assistantId),
      );
    }
  }

  function retryLastMessage() {
    if (!lastFailedMessage) return;
    void submitMessage(lastFailedMessage, { repeatUserMessage: false });
  }

  return (
    <div className="flex min-h-0 w-full flex-col" role="presentation">
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="truncate text-sm font-semibold">New AI chat</h2>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">TradeLab</Badge>
            <span className="truncate text-xs text-muted-foreground">
              {scopeTitle}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close AI assistant"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {messages.length === 0 ? (
            <div className="grid gap-4 py-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full border bg-muted/40">
                <Sparkles className="size-5" aria-hidden="true" />
              </div>
              <div className="grid gap-2">
                <h3 className="text-base font-semibold">
                  How can I help with TradeLab?
                </h3>
                <p className="mx-auto max-w-72 text-sm text-muted-foreground">
                  {helperCopy}
                </p>
              </div>
              <div className="grid gap-2 text-left">
                {promptShortcuts.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    className="justify-start"
                    onClick={() => submitMessage(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "ml-8 bg-primary text-primary-foreground"
                    : "mr-8 border bg-muted/30 text-foreground",
                )}
              >
                {message.role === "assistant" && message.content.length === 0
                  ? "Thinking..."
                  : message.content}
              </div>
            ))
          )}

          {error ? (
            <Alert role="alert" variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <div className="flex items-center justify-between gap-3">
                <AlertDescription>{error}</AlertDescription>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Retry message"
                  onClick={retryLastMessage}
                  disabled={!lastFailedMessage || isSending}
                >
                  {isSending ? "Retrying..." : "Retry"}
                </Button>
              </div>
            </Alert>
          ) : null}
        </div>
      </ScrollArea>

      <Separator />
      <form
        className="grid shrink-0 gap-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage(draft);
        }}
      >
        <Textarea
          aria-label="Message AI assistant"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about TradeLab..."
          className="min-h-20 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Phase 2 streamed local LLM helper
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={!canSend}
            aria-label="Send message"
          >
            <Send className="size-4" aria-hidden="true" />
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
