import { NextApiRequest, NextApiResponse } from "next";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
  pageDirective?: string;
  sessionId?: string;
  siteUrl?: string;
  currentPath?: string;
  stream?: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const querylessUrl = process.env.QUERYLESS_URL;
  const querylessToken = process.env.QUERYLESS_TOKEN;
  const querylessModel = process.env.QUERYLESS_MODEL;
  const portalUrl = process.env.NEXT_PUBLIC_DMS || "";

  if (!querylessUrl) {
    res.status(500).json({ error: "Missing QUERYLESS_URL server environment variable" });
    return;
  }

  if (!querylessToken) {
    res.status(500).json({ error: "Missing QUERYLESS_TOKEN server environment variable" });
    return;
  }

  if (!querylessModel) {
    res.status(500).json({
      error: "Missing QUERYLESS_MODEL server environment variable",
    });
    return;
  }

  const {
    messages = [],
    pageDirective = "search",
    sessionId,
    siteUrl: rawSiteUrl = "",
    currentPath = "",
    stream = false,
  } =
    (req.body || {}) as RequestBody;

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Invalid request: messages must be an array" });
    return;
  }

  try {
    const siteUrl =
      typeof rawSiteUrl === "string" && rawSiteUrl.trim()
        ? rawSiteUrl.trim()
        : "http://localhost:3000";
    const routesBlock = [
      "Routes:",
      "  dataset: /@{org}/{name}",
      "  resource: /@{org}/{dataset}/r/{resource}",
      "  organization: /@{name}",
      "  group: /groups/{name}",
      "  search: /search",
    ].join("\n");

    const upstream = await fetch(querylessUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${querylessToken}`,
      },
      body: JSON.stringify({
        model: querylessModel,
        stream: Boolean(stream),
        user: sessionId,
        messages: [
          {
            role: "system",
            content: `Portal: ${portalUrl}\nSite: ${siteUrl}\nPage: ${pageDirective}\nCurrentPath: ${currentPath}\n${routesBlock}`,
          },
          ...messages,
        ],
      }),
    });

    if (stream) {
      if (!upstream.ok) {
        const details = await upstream.text();
        console.error("[Queryless API] Upstream streaming request failed", {
          status: upstream.status,
          statusText: upstream.statusText,
          details,
          pageDirective,
          currentPath,
        });
        res.status(upstream.status).json({
          error: "Queryless upstream request failed",
          details,
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (!upstream.body) {
        console.error("[Queryless API] Missing upstream stream body", {
          status: upstream.status,
          pageDirective,
          currentPath,
        });
        res.write(`data: ${JSON.stringify({ error: "Missing upstream stream body" })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            res.write(decoder.decode(value, { stream: true }));
          }
        }
      } finally {
        res.end();
      }
      return;
    }

    const contentType = upstream.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await upstream.json()
      : await upstream.text();

    if (!upstream.ok) {
      console.error("[Queryless API] Upstream request failed", {
        status: upstream.status,
        statusText: upstream.statusText,
        details: data,
        pageDirective,
        currentPath,
      });
      res.status(upstream.status).json({
        error: "Queryless upstream request failed",
        details: data,
      });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("[Queryless API] Unexpected error while contacting Queryless", {
      error,
      pageDirective: req.body?.pageDirective,
      currentPath: req.body?.currentPath,
    });
    res.status(500).json({ error: "Unexpected error while contacting Queryless" });
  }
}
