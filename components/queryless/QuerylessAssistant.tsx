import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { RiDeleteBinLine, RiSparkling2Line } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VegaSpecRenderer, { parseVegaSpecText } from "./VegaSpecRenderer";

const QUERYLESS_ENABLED = process.env.NEXT_PUBLIC_QUERYLESS_ENABLED === "true";
const QUERYLESS_API_ROUTE =
  process.env.NEXT_PUBLIC_QUERYLESS_API_ROUTE || "/api/queryless-chat";
const QUERYLESS_STORAGE_KEY = "queryless:enabled";
const QUERYLESS_OPEN_STORAGE_KEY = "queryless:open";
const QUERYLESS_RATE_LIMIT_STORAGE_KEY = "queryless:rate-limit";
const QUERYLESS_DAILY_LIMIT_STORAGE_KEY = "queryless:daily-limit";
const QUERYLESS_RATE_LIMIT_MAX_REQUESTS = 4;
const QUERYLESS_RATE_LIMIT_WINDOW_MS = 60_000;
const QUERYLESS_DAILY_LIMIT_MAX_REQUESTS = 20;

type QuerylessContext = {
  path: string;
  pageDirective: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  variant?: "default" | "context";
};

type ParsedAssistantContent = {
  mainContent: string;
  methodContent: string | null;
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

function extractTextFromPayload(payload: any): string {
  const deltaContent = payload?.choices?.[0]?.delta?.content;
  const messageContent = payload?.choices?.[0]?.message?.content;

  const normalizedDelta =
    Array.isArray(deltaContent)
      ? deltaContent
          .map((item: any) => (typeof item === "string" ? item : item?.text || ""))
          .join("")
      : deltaContent;

  const normalizedMessage =
    Array.isArray(messageContent)
      ? messageContent
          .map((item: any) => (typeof item === "string" ? item : item?.text || ""))
          .join("")
      : messageContent;

  return (
    normalizedDelta ||
    normalizedMessage ||
    payload?.choices?.[0]?.text ||
    payload?.message ||
    payload?.result ||
    payload?.output ||
    payload?.answer ||
    ""
  );
}

function isLocalLink(href: string | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("/")) return true;
  if (typeof window === "undefined") return false;
  return href.startsWith(window.location.origin);
}

function maskIncompleteChartBlock(content: string): string {
  const chartStart = content.lastIndexOf("```chart");
  const vegaStart = content.lastIndexOf("```vega");
  const blockStart = Math.max(chartStart, vegaStart);

  if (blockStart === -1) return content;

  const closingFence = content.indexOf("```", blockStart + 3);
  if (closingFence === -1) {
    return content.slice(0, blockStart).trimEnd();
  }

  return content;
}

function maskIncompleteAuxiliaryBlocks(content: string): string {
  const methodStart = content.lastIndexOf("[[QUERYLESS_METHOD]]");
  const methodEnd = content.indexOf(
    "[[/QUERYLESS_METHOD]]",
    Math.max(0, methodStart)
  );
  if (methodStart !== -1 && methodEnd === -1) {
    return content.slice(0, methodStart).trimEnd();
  }

  return content;
}

function parseAssistantContent(content: string): ParsedAssistantContent {
  let mainContent = content;
  let methodContent: string | null = null;

  const methodMatch = mainContent.match(
    /\[\[QUERYLESS_METHOD\]\]\s*([\s\S]*?)\s*\[\[\/QUERYLESS_METHOD\]\]/
  );
  if (methodMatch?.[1]) {
    methodContent = methodMatch[1].trim();
    mainContent = mainContent.replace(methodMatch[0], "").trim();
  }

  return {
    mainContent,
    methodContent,
  };
}

function isInlineCodeNode(className: string | undefined, children: React.ReactNode) {
  const text = String(children);
  return !className && !text.includes("\n");
}

function getRecentQuestionTimestamps(now = Date.now()): number[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(QUERYLESS_RATE_LIMIT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (value): value is number =>
        typeof value === "number" && now - value < QUERYLESS_RATE_LIMIT_WINDOW_MS
    );
  } catch {
    return [];
  }
}

function persistQuestionTimestamps(timestamps: number[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    QUERYLESS_RATE_LIMIT_STORAGE_KEY,
    JSON.stringify(timestamps)
  );
}

function getRateLimitState(now = Date.now()) {
  const recent = getRecentQuestionTimestamps(now);
  const isLimited = recent.length >= QUERYLESS_RATE_LIMIT_MAX_REQUESTS;
  const retryAt = isLimited ? recent[0] + QUERYLESS_RATE_LIMIT_WINDOW_MS : null;

  return {
    recent,
    isLimited,
    retryAt,
  };
}

function formatRateLimitMessage(retryAt: number | null, now = Date.now()) {
  if (!retryAt) return null;
  const secondsRemaining = Math.max(1, Math.ceil((retryAt - now) / 1000));
  return `Rate limit reached: ${QUERYLESS_RATE_LIMIT_MAX_REQUESTS} questions per ${Math.round(
    QUERYLESS_RATE_LIMIT_WINDOW_MS / 1000
  )} seconds. Try again in ${secondsRemaining}s.`;
}

function getDailyUsagePillClassName(count: number) {
  if (count >= QUERYLESS_DAILY_LIMIT_MAX_REQUESTS) {
    return "bg-red-100 text-red-700";
  }
  if (count >= QUERYLESS_DAILY_LIMIT_MAX_REQUESTS * 0.75) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-slate-100 text-slate-600";
}

function getLocalDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDailyUsageState(now = new Date()) {
  if (typeof window === "undefined") {
    return { dateKey: getLocalDateKey(now), count: 0, isLimited: false };
  }

  const dateKey = getLocalDateKey(now);
  const raw = window.localStorage.getItem(QUERYLESS_DAILY_LIMIT_STORAGE_KEY);

  if (!raw) {
    return { dateKey, count: 0, isLimited: false };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.dateKey !== dateKey || typeof parsed?.count !== "number") {
      return { dateKey, count: 0, isLimited: false };
    }

    return {
      dateKey,
      count: parsed.count,
      isLimited: parsed.count >= QUERYLESS_DAILY_LIMIT_MAX_REQUESTS,
    };
  } catch {
    return { dateKey, count: 0, isLimited: false };
  }
}

function persistDailyUsage(dateKey: string, count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    QUERYLESS_DAILY_LIMIT_STORAGE_KEY,
    JSON.stringify({ dateKey, count })
  );
}

const AssistantMessageBody = memo(function AssistantMessageBody({
  content,
}: {
  content: string;
}) {
  const { mainContent, methodContent } = useMemo(
    () => parseAssistantContent(content),
    [content]
  );

  return (
    <div className="space-y-2">
      {mainContent ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ node, ...props }) => (
              <p className="mb-2 last:mb-0" {...props} />
            ),
            a: ({ node, ...props }) =>
              isLocalLink(props.href) ? (
                <Link
                  href={props.href || "/"}
                  className="underline text-sky-700 hover:text-sky-800"
                >
                  {props.children}
                </Link>
              ) : (
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
            code: ({ node, inline, className, children, ...props }) =>
              isInlineCodeNode(className, children) ? (
                <code
                  className="rounded bg-slate-200 px-1 py-0.5"
                  {...props}
                >
                  {children}
                </code>
              ) : (
                (() => {
                  const language = (className || "").replace("language-", "");
                  const isChartBlock =
                    language === "chart" || language === "vega";

                  if (isChartBlock) {
                    const specText = String(children).trim();
                    if (parseVegaSpecText(specText)) {
                      return <VegaSpecRenderer specText={specText} />;
                    }
                  }

                  return (
                    <pre className="mb-2 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100 last:mb-0">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                })()
              ),
          }}
        >
          {mainContent}
        </ReactMarkdown>
      ) : null}

      {methodContent ? (
        <details className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            How this was calculated
          </summary>
          <div className="mt-2 text-slate-700">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ node, ...props }) => (
                  <p className="mb-2 last:mb-0" {...props} />
                ),
                a: ({ node, ...props }) =>
                  isLocalLink(props.href) ? (
                    <Link
                      href={props.href || "/"}
                      className="underline text-sky-700 hover:text-sky-800"
                    >
                      {props.children}
                    </Link>
                  ) : (
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
                code: ({ node, inline, className, children, ...props }) =>
                  isInlineCodeNode(className, children) ? (
                    <code
                      className="rounded bg-slate-200 px-1 py-0.5"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <pre className="mb-2 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100 last:mb-0">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                ),
              }}
            >
              {methodContent}
            </ReactMarkdown>
          </div>
        </details>
      ) : null}
    </div>
  );
});

export default function QuerylessAssistant() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      content:
        "Hi, I’m Queryless 👋\n\nAsk questions in plain English. No SQL needed.\n\nTry things like:\n- “Are there any datasets about climate change?”\n- “What are the available groups?”\n- “Compare the top 10 by emissions.”\n- “Create a chart for this trend.”\n\nI’m aware of the page you are browsing 👀",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  const [rateLimitRetryAt, setRateLimitRetryAt] = useState<number | null>(null);
  const [dailyUsageCount, setDailyUsageCount] = useState(0);
  const [viewingNotice, setViewingNotice] = useState("Viewing search");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);
  const streamRafRef = useRef<number | null>(null);
  const streamedAnswerRef = useRef("");
  const sessionIdRef = useRef<string>(createSessionId());
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

    const { isLimited, retryAt } = getRateLimitState();
    const dailyUsage = getDailyUsageState();
    setDailyUsageCount(dailyUsage.count);
    setRateLimitRetryAt(retryAt);
    setRateLimitMessage(
      dailyUsage.isLimited
        ? `Daily limit reached: ${QUERYLESS_DAILY_LIMIT_MAX_REQUESTS} questions used today. Try again tomorrow.`
        : isLimited
          ? formatRateLimitMessage(retryAt)
          : null
    );
  }, []);

  useEffect(() => {
    if (!rateLimitRetryAt && !rateLimitMessage) return;

    const updateRateLimit = () => {
      const { isLimited, retryAt } = getRateLimitState();
      const dailyUsage = getDailyUsageState();
      setDailyUsageCount(dailyUsage.count);
      setRateLimitRetryAt(retryAt);
      setRateLimitMessage(
        dailyUsage.isLimited
          ? `Daily limit reached: ${QUERYLESS_DAILY_LIMIT_MAX_REQUESTS} questions used today. Try again tomorrow.`
          : isLimited
            ? formatRateLimitMessage(retryAt)
            : null
      );
    };

    updateRateLimit();
    const timer = window.setInterval(updateRateLimit, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [rateLimitRetryAt]);

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
    const didAddNewMessage = messages.length > previousMessageCountRef.current;
    if (!shouldAutoScrollRef.current && !didAddNewMessage) {
      previousMessageCountRef.current = messages.length;
      return;
    }

    const container = messagesContainerRef.current;
    if (!container) {
      previousMessageCountRef.current = messages.length;
      return;
    }

    container.scrollTop = container.scrollHeight;
    previousMessageCountRef.current = messages.length;
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
      if (streamRafRef.current !== null) {
        window.cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
    },
    []
  );

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || isSending) return;

    const dailyUsage = getDailyUsageState();
    if (dailyUsage.isLimited) {
      setDailyUsageCount(dailyUsage.count);
      setRateLimitMessage(
        `Daily limit reached: ${QUERYLESS_DAILY_LIMIT_MAX_REQUESTS} questions used today. Try again tomorrow.`
      );
      return;
    }

    const now = Date.now();
    const { recent, isLimited, retryAt } = getRateLimitState(now);
    if (isLimited) {
      setRateLimitRetryAt(retryAt);
      setRateLimitMessage(formatRateLimitMessage(retryAt, now));
      return;
    }
    hasExchangeSinceLastPageChangeRef.current = true;
    const assistantMessageId = `assistant-${Date.now()}`;

    const requestMessages: ChatMessage[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: question,
      },
    ];

    const nextMessages: ChatMessage[] = [
      ...requestMessages,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
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
          siteUrl: window.location.origin,
          currentPath: context.path,
          stream: true,
          messages: requestMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const details = await response
          .json()
          .catch(async () => {
            const text = await response.text().catch(() => "");
            return text ? { details: text } : null;
          });
        const reason =
          details?.error ||
          details?.details ||
          details?.message ||
          "Queryless request failed";
        throw new Error(`${reason} (${response.status})`);
      }

      const contentType = response.headers.get("content-type") || "";
      let answer = "";
      streamedAnswerRef.current = "";

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let isDone = false;
        let streamError: string | null = null;

        while (!isDone) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const lines = event
              .split("\n")
              .map(line => line.trim())
              .filter(Boolean);

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const raw = line.replace(/^data:\s*/, "");
              if (raw === "[DONE]") {
                isDone = true;
                break;
              }

              try {
                const payload = JSON.parse(raw);
                if (payload?.error) {
                  streamError =
                    typeof payload.error === "string"
                      ? payload.error
                      : payload.error?.message || "Streaming response error";
                  continue;
                }
                const token = extractTextFromPayload(payload);
                if (!token) continue;
                answer += token;
                streamedAnswerRef.current = answer;
                if (streamRafRef.current === null) {
                  streamRafRef.current = window.requestAnimationFrame(() => {
                    const partial = maskIncompleteAuxiliaryBlocks(
                      maskIncompleteChartBlock(streamedAnswerRef.current)
                    );
                    setMessages(prev =>
                      prev.map(message =>
                        message.id === assistantMessageId
                          ? { ...message, content: partial }
                          : message
                      )
                    );
                    streamRafRef.current = null;
                  });
                }
              } catch {
                // Ignore non-JSON stream frames
              }
            }
          }
        }

        if (streamError) {
          throw new Error(streamError);
        }
      } else {
        const data = await response.json();
        answer = extractTextFromPayload(data);
      }

      if (!answer || typeof answer !== "string") {
        throw new Error("Queryless response did not include a text answer");
      }
      if (streamRafRef.current !== null) {
        window.cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      const successTimestamp = Date.now();
      const successRecent = getRecentQuestionTimestamps(successTimestamp);
      persistQuestionTimestamps([...successRecent, successTimestamp]);
      const successDailyUsage = getDailyUsageState();
      persistDailyUsage(
        successDailyUsage.dateKey,
        successDailyUsage.count + 1
      );
      setDailyUsageCount(successDailyUsage.count + 1);
      setRateLimitRetryAt(null);
      setRateLimitMessage(null);
      setMessages(prev =>
        prev.map(message =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: answer,
              }
            : message
        )
      );
    } catch (err) {
      if (streamRafRef.current !== null) {
        window.cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      console.error("[Queryless] Chat request failed", {
        error: err,
        pageDirective: context.pageDirective,
        path: context.path,
        sessionId: sessionIdRef.current,
      });
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error when contacting Queryless";
      setMessages(prev =>
        prev.map(item =>
          item.id === assistantMessageId && !item.content
            ? { ...item, content: `I ran into an issue while replying: ${message}` }
            : item
        )
      );
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
          "Hi, I’m Queryless 👋\n\nAsk questions in plain English. No SQL needed.\n\nTry things like:\n- “Are there any datasets about climate change?”\n- “What are the available groups?”\n- “Compare the top 10 by emissions.”\n- “Create a chart for this trend.”\n\nI’m aware of the page you are browsing 👀",
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
                  <div
                    ref={messagesContainerRef}
                    onScroll={event => {
                      const container = event.currentTarget;
                      const distanceFromBottom =
                        container.scrollHeight - container.scrollTop - container.clientHeight;
                      shouldAutoScrollRef.current = distanceFromBottom < 56;
                    }}
                    className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                  >
                    {messages.map(message => (
                      (() => {
                        const isEmptyAssistantMessage =
                          message.role === "assistant" &&
                          message.variant !== "context" &&
                          !message.content.trim();
                        const containsChartBlock =
                          message.role === "assistant" &&
                          (message.content.includes("```chart") ||
                            message.content.includes("```vega"));

                        if (isEmptyAssistantMessage) {
                          return null;
                        }

                        return (
                          <div
                            key={message.id}
                            className={`${
                              message.variant === "context"
                                ? "mx-auto w-fit rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500"
                                : `${containsChartBlock ? "w-full max-w-full" : "max-w-[90%]"} rounded-2xl px-3 py-2 text-sm ${
                                    message.role === "assistant"
                                      ? "bg-slate-100 text-slate-800"
                                      : "ml-auto bg-sky-600 text-white"
                                  }`
                            }`}
                          >
                            {message.role === "assistant" && message.variant !== "context" ? (
                              <AssistantMessageBody content={message.content} />
                            ) : (
                              message.content
                            )}
                          </div>
                        );
                      })()
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
                    {rateLimitMessage && (
                      <p className="mb-2 text-xs text-amber-700">
                        {rateLimitMessage}
                      </p>
                    )}
                    <div className="mb-2">
                      <div className="group relative inline-flex">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getDailyUsagePillClassName(
                          dailyUsageCount
                        )}`}
                      >
                        Daily questions: {dailyUsageCount} / {QUERYLESS_DAILY_LIMIT_MAX_REQUESTS}
                      </span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                          You can ask up to {QUERYLESS_DAILY_LIMIT_MAX_REQUESTS} questions per day.
                        </span>
                      </div>
                    </div>
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
                        disabled={isSending || !input.trim() || Boolean(rateLimitMessage)}
                        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Send
                      </button>
                    </div>
                    <p className="mt-2 text-center text-xs text-slate-500">
                      <a
                        href="https://querylessai.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-slate-700"
                      >
                        QuerylessAI
                      </a>{" "}
                      can make mistakes. <br /> By using this chat you accept the{" "}
                      <Link
                        href="/ai-terms-of-use"
                        className="underline hover:text-slate-700"
                      >
                        AI Terms of Use
                      </Link>.
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
