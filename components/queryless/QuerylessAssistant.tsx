import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { RiDeleteBinLine, RiSparkling2Line } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChartRenderer, { ChartSpec, parseChartSpec } from "./ChartRenderer";

const QUERYLESS_ENABLED = process.env.NEXT_PUBLIC_QUERYLESS_ENABLED === "true";
const QUERYLESS_API_ROUTE =
  process.env.NEXT_PUBLIC_QUERYLESS_API_ROUTE || "/api/queryless-chat";
const QUERYLESS_STORAGE_KEY = "queryless:enabled";
const QUERYLESS_OPEN_STORAGE_KEY = "queryless:open";

type QuerylessContext = {
  path: string;
  pageDirective: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  chart?: ChartSpec;
  variant?: "default" | "context";
};

function getPageDirective(
  pathname: string,
  asPath: string
): string {
  const cleanPath = asPath.split("?")[0] || "/";
  const segments = cleanPath.split("/").filter(Boolean);
  const first = segments[0] || "";

  if (pathname === "/") return "home";
  if (cleanPath === "/search") return "search";
  if (cleanPath === "/groups" || cleanPath === "/organizations") return "search";

  if (first === "groups" && segments[1]) {
    return `group/${segments[1]}`;
  }

  if (first.startsWith("@")) {
    const org = first.replace(/^@/, "");
    const dataset = segments[1];
    const resourceId = segments[3];

    if (dataset && segments[2] === "r" && resourceId) {
      return `resource/${dataset}/${resourceId}`;
    }

    if (dataset) {
      return `dataset/${dataset}`;
    }

    if (org) {
      return `organization/${org}`;
    }
  }

  return "search";
}

function createSessionId(): string {
  return `queryless-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toTitleCaseFromSlug(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getFallbackViewingNotice(pageDirective: string): string {
  if (pageDirective.startsWith("dataset/")) {
    const datasetSlug = pageDirective.replace("dataset/", "");
    return `Viewing dataset ${toTitleCaseFromSlug(datasetSlug)}`;
  }
  if (pageDirective.startsWith("resource/")) {
    const resourcePath = pageDirective.replace("resource/", "");
    return `Viewing resource ${toTitleCaseFromSlug(resourcePath.split("/")[1] || resourcePath)}`;
  }
  if (pageDirective.startsWith("organization/")) {
    return `Viewing organization ${toTitleCaseFromSlug(pageDirective.replace("organization/", ""))}`;
  }
  if (pageDirective.startsWith("group/")) {
    return `Viewing group ${toTitleCaseFromSlug(pageDirective.replace("group/", ""))}`;
  }
  if (pageDirective === "home") return "Viewing home";
  return "Viewing search";
}

function extractChartPayload(content: string): {
  markdown: string;
  chart?: ChartSpec;
} {
  const chartFencePattern = /```chart\s*([\s\S]*?)```/i;
  const legacyChartFencePattern = /```queryless_chart\s*([\s\S]*?)```/i;
  const match = chartFencePattern.exec(content) || legacyChartFencePattern.exec(content);

  if (!match) {
    return { markdown: content };
  }

  const rawJson = match[1]?.trim();
  let parsed: unknown = null;

  try {
    parsed = rawJson ? JSON.parse(rawJson) : null;
  } catch {
    return { markdown: content };
  }

  const chart = parseChartSpec(parsed);
  if (!chart) {
    return { markdown: content };
  }

  const markdown = content
    .replace(chartFencePattern, "")
    .replace(legacyChartFencePattern, "")
    .trim();
  return { markdown: markdown || "Here is the chart:", chart };
}

export default function QuerylessAssistant() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      content:
        "Hi! I’m aware of the page you’re currently viewing. Ask me questions about the data here, or ask me to generate a chart.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingNotice, setViewingNotice] = useState("Viewing search");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(createSessionId());
  const lastPageDirectiveRef = useRef<string>("");
  const lastContextPathRef = useRef<string | null>(null);
  const lastContextMessageIdRef = useRef<string | null>(null);
  const hasExchangeSinceLastPageChangeRef = useRef(false);

  useEffect(() => {
    const override = window.localStorage.getItem(QUERYLESS_STORAGE_KEY);

    if (override === "true") {
      setEnabledOverride(true);
      return;
    }

    if (override === "false") {
      setEnabledOverride(false);
    }

    const wasOpen = window.localStorage.getItem(QUERYLESS_OPEN_STORAGE_KEY);
    if (wasOpen === "true") {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const enabled = enabledOverride ?? QUERYLESS_ENABLED;

  const context = useMemo<QuerylessContext>(
    () => ({
      path: router.asPath,
      pageDirective: getPageDirective(router.pathname, router.asPath),
    }),
    [router.asPath, router.pathname]
  );

  useEffect(() => {
    if (!lastPageDirectiveRef.current) {
      lastPageDirectiveRef.current = context.pageDirective;
      return;
    }
    if (lastPageDirectiveRef.current !== context.pageDirective) {
      sessionIdRef.current = createSessionId();
      lastPageDirectiveRef.current = context.pageDirective;
    }
  }, [context.pageDirective]);

  useEffect(() => {
    const fallback = getFallbackViewingNotice(context.pageDirective);
    setViewingNotice(fallback);

    const readTitleFromPage = () => {
      const h1 = document.querySelector("main h1, h1");
      const titleText = h1?.textContent?.trim();
      if (!titleText) return;

      if (context.pageDirective.startsWith("dataset/")) {
        setViewingNotice(`Viewing dataset ${titleText}`);
        return;
      }
      if (context.pageDirective.startsWith("resource/")) {
        setViewingNotice(`Viewing resource ${titleText}`);
        return;
      }
      if (context.pageDirective.startsWith("organization/")) {
        setViewingNotice(`Viewing organization ${titleText}`);
        return;
      }
      if (context.pageDirective.startsWith("group/")) {
        setViewingNotice(`Viewing group ${titleText}`);
      }
    };

    const frameId = window.requestAnimationFrame(readTitleFromPage);
    const timeoutId = window.setTimeout(readTitleFromPage, 200);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [context.pageDirective, context.path]);

  useEffect(() => {
    const currentPath = context.path;
    const currentNotice = viewingNotice;

    if (!lastContextPathRef.current) {
      const contextMessageId = `assistant-context-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        {
          id: contextMessageId,
          role: "assistant",
          content: currentNotice,
          variant: "context",
        },
      ]);
      lastContextPathRef.current = currentPath;
      lastContextMessageIdRef.current = contextMessageId;
      hasExchangeSinceLastPageChangeRef.current = false;
      return;
    }

    if (lastContextPathRef.current !== currentPath) {
      if (hasExchangeSinceLastPageChangeRef.current) {
        const contextMessageId = `assistant-context-${Date.now()}`;
        setMessages(prev => [
          ...prev,
          {
            id: contextMessageId,
            role: "assistant",
            content: currentNotice,
            variant: "context",
          },
        ]);
        lastContextMessageIdRef.current = contextMessageId;
      } else if (lastContextMessageIdRef.current) {
        const lastMessageId = lastContextMessageIdRef.current;
        setMessages(prev =>
          prev.map(message =>
            message.id === lastMessageId
              ? { ...message, content: currentNotice }
              : message
          )
        );
      }

      lastContextPathRef.current = currentPath;
      hasExchangeSinceLastPageChangeRef.current = false;
      return;
    }

    if (lastContextMessageIdRef.current) {
      const lastMessageId = lastContextMessageIdRef.current;
      setMessages(prev =>
        prev.map(message =>
          message.id === lastMessageId ? { ...message, content: currentNotice } : message
        )
      );
    }
  }, [context.path, viewingNotice]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("queryless-drawer-open");
      window.localStorage.setItem(QUERYLESS_OPEN_STORAGE_KEY, "true");
      return;
    }
    document.body.classList.remove("queryless-drawer-open");
    window.localStorage.setItem(QUERYLESS_OPEN_STORAGE_KEY, "false");
  }, [isOpen]);

  useEffect(
    () => () => {
      document.body.classList.remove("queryless-drawer-open");
    },
    []
  );

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || isSending) return;
    hasExchangeSinceLastPageChangeRef.current = true;

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: question,
      },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(QUERYLESS_API_ROUTE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          pageDirective: context.pageDirective,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const details = await response.json().catch(() => null);
        const reason = details?.error || "Queryless request failed";
        throw new Error(`${reason} (${response.status})`);
      }

      const data = await response.json();
      const answer =
        data?.answer ||
        data?.message ||
        data?.result ||
        data?.output ||
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text;
      const directChart =
        parseChartSpec(data?.chart) ||
        parseChartSpec(data?.artifact) ||
        parseChartSpec(data?.artifacts?.[0]);

      if (!answer || typeof answer !== "string") {
        if (directChart) {
          setMessages(prev => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: "Here is the chart:",
              chart: directChart,
            },
          ]);
          return;
        }
        throw new Error("Queryless response did not include a text answer");
      }
      const parsedAnswer = extractChartPayload(answer);

      setMessages(prev => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: parsedAnswer.markdown,
          chart: parsedAnswer.chart || directChart || undefined,
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error when contacting Queryless";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  if (!enabled) {
    return null;
  }

  const clearChat = () => {
    const contextMessageId = `assistant-context-${Date.now()}`;
    setMessages([
      {
        id: "assistant-welcome",
        role: "assistant",
        content:
          "Hi! I’m aware of the page you’re currently viewing. Ask me questions about the data here, or ask me to generate a chart.",
      },
      {
        id: contextMessageId,
        role: "assistant",
        content: viewingNotice,
        variant: "context",
      },
    ]);
    sessionIdRef.current = createSessionId();
    lastContextMessageIdRef.current = contextMessageId;
    hasExchangeSinceLastPageChangeRef.current = false;
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-[60] inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        aria-label="Open AI assistant"
        onClick={() => setIsOpen(true)}
      >
        <RiSparkling2Line aria-hidden="true" size={16} />
        Ask AI
      </button>

      {isOpen && (
        <>
          <aside
            role="dialog"
            aria-modal="false"
            aria-label="AI assistant"
            className="fixed right-0 top-0 z-[70] h-screen w-full max-w-[560px] border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    AI Assistant
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ask questions in plain English about the data
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={clearChat}
                      className="rounded p-2 text-slate-600 hover:bg-slate-100"
                      aria-label="Clear chat"
                    >
                      <RiDeleteBinLine size={16} />
                    </button>
                    <span className="pointer-events-none absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      Clear chat
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="h-full min-h-0">
                <div className="flex h-full flex-col">
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`${
                          message.variant === "context"
                            ? "mx-auto w-fit rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500"
                            : `max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                                message.role === "assistant"
                                  ? "bg-slate-100 text-slate-800"
                                  : "ml-auto bg-sky-600 text-white"
                              }`
                        }`}
                      >
                        {message.role === "assistant" && message.variant !== "context" ? (
                          <>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ node, ...props }) => (
                                  <p className="mb-2 last:mb-0" {...props} />
                                ),
                                a: ({ node, ...props }) => (
                                  <a
                                    {...props}
                                    className="underline text-sky-700 hover:text-sky-800"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  />
                                ),
                                ul: ({ node, ...props }) => (
                                  <ul className="mb-2 list-disc pl-5 last:mb-0" {...props} />
                                ),
                                ol: ({ node, ...props }) => (
                                  <ol className="mb-2 list-decimal pl-5 last:mb-0" {...props} />
                                ),
                                li: ({ node, ...props }) => (
                                  <li className="mb-1 last:mb-0" {...props} />
                                ),
                                table: ({ node, ...props }) => (
                                  <div className="mb-2 overflow-x-auto last:mb-0">
                                    <table
                                      className="w-full border-collapse border border-slate-300 text-xs"
                                      {...props}
                                    />
                                  </div>
                                ),
                                thead: ({ node, ...props }) => (
                                  <thead className="bg-slate-200" {...props} />
                                ),
                                th: ({ node, ...props }) => (
                                  <th
                                    className="border border-slate-300 px-2 py-1 text-left font-semibold"
                                    {...props}
                                  />
                                ),
                                td: ({ node, ...props }) => (
                                  <td className="border border-slate-300 px-2 py-1" {...props} />
                                ),
                                code: ({ node, inline, ...props }) =>
                                  inline ? (
                                    <code className="rounded bg-slate-200 px-1 py-0.5" {...props} />
                                  ) : (
                                    <pre className="mb-2 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100 last:mb-0">
                                      <code {...props} />
                                    </pre>
                                  ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                            {message.chart && <ChartRenderer chart={message.chart} />}
                          </>
                        ) : (
                          message.content
                        )}
                      </div>
                    ))}
                    {isSending && (
                      <div className="max-w-[90%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1" aria-hidden="true">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" />
                          </span>
                          <span>Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-slate-200 p-3">
                    {error && (
                      <p className="mb-2 text-xs text-red-600">{error}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={event => setInput(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        placeholder="Ask about this page or your data..."
                        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={isSending || !input.trim()}
                        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Send
                      </button>
                    </div>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      Powered by{" "}
                      <a
                        href="https://querylessai.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-slate-700"
                      >
                        querylessai.com
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <span className="sr-only" data-testid="queryless-context-path">
              {context.path}
            </span>
          </aside>
        </>
      )}
    </>
  );
}
