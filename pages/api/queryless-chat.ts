import { NextApiRequest, NextApiResponse } from "next";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: ChatMessage[];
  pageDirective?: string;
  sessionId?: string;
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
  const querylessAgentId =
    process.env.QUERYLESS_AGENT_ID || "queryless-portaljs-demo";
  const querylessModel =
    process.env.QUERYLESS_MODEL || `openclaw:${querylessAgentId}`;
  const portalUrl = process.env.NEXT_PUBLIC_DMS || "";
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!querylessUrl) {
    res.status(500).json({ error: "Missing QUERYLESS_URL server environment variable" });
    return;
  }

  if (!querylessToken) {
    res.status(500).json({ error: "Missing QUERYLESS_TOKEN server environment variable" });
    return;
  }

  const { messages = [], pageDirective = "search", sessionId } =
    (req.body || {}) as RequestBody;

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Invalid request: messages must be an array" });
    return;
  }

  try {
    const forwardedProto = (req.headers["x-forwarded-proto"] as string) || "http";
    const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
    const derivedSiteUrl = forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : "";
    const siteUrl = configuredSiteUrl || derivedSiteUrl;
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
        "x-openclaw-agent-id": querylessAgentId,
      },
      body: JSON.stringify({
        model: querylessModel,
        stream: false,
        user: sessionId,
        messages: [
          {
            role: "system",
            content: `Portal: ${portalUrl}\nSite: ${siteUrl}\nPage: ${pageDirective}\n${routesBlock}`,
          },
          ...messages,
        ],
      }),
    });

    const contentType = upstream.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await upstream.json()
      : await upstream.text();

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: "Queryless upstream request failed",
        details: data,
      });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unexpected error while contacting Queryless" });
  }
}
