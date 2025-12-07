/**
 * LLM Chat Worker
 *
 * Handles /api/chat requests using Cloudflare Workers AI
 */

import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve frontend if not /api/chat
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Handle /api/chat POST
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env);
    }

    // Method not allowed or 404
    if (url.pathname === "/api/chat") {
      return new Response("Method not allowed", { status: 405 });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleChatRequest(request: Request, env: Env): Promise<Response> {
  try {
    // Parse JSON body
    const { messages = [] } = (await request.json()) as { messages: ChatMessage[] };

    // Add system prompt if missing
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    // Call AI with streaming
    const aiResult = await env.AI.run(
      MODEL_ID,
      { messages, max_tokens: 1024 },
      { stream: true }
    );

    // Handle different return types
    if (aiResult instanceof Response) {
      if (!aiResult.body) throw new Error("AI Response has no body stream");
      return new Response(aiResult.body, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (aiResult instanceof ReadableStream) {
      return new Response(aiResult, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    throw new Error("Unexpected AI result type");

  } catch (error) {
    console.error("Error processing chat request:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to process request",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
