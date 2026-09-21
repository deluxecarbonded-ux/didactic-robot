// Exotic — Oracle proxy
// A thin pass-through to OpenRouter's /chat/completions so the browser never
// ships a paid API key into the client bundle. The client keeps its free-model
// ladder (see assets/js/net/ai.js): each model that fails or rate-limits rolls
// onto the next one. The proxy simply forwards the body the client built and
// returns the upstream payload verbatim, status included, so the ladder can
// read error codes (429 → rotate) and completions unchanged.
//
// Set OPENROUTER_API_KEY as an edge function secret:
//   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
// While the secret is empty the endpoint answers 503 — the client then falls
// back to calling OpenRouter directly with the user-entered key.

import { CORS_HEADERS, gate, json } from "../_shared/cors.ts";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, 405);
  }

  const g = await gate(req);
  if (!g.ok) return json(g.body ?? { error: { message: "Unauthorized." } }, g.status);

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) {
    return json(
      { error: { message: "Oracle is not configured on this project. Add OPENROUTER_API_KEY or use a client key." } },
      503,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: "Body must be JSON." } }, 400);
  }

  const payload = body as Record<string, unknown>;
  if (!payload.model || !Array.isArray(payload.messages) || !payload.messages.length) {
    return json({ error: { message: "Expected { model, messages }." } }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": req.headers.get("origin") || "https://exotic.game",
        "X-Title": "Exotic",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: { message: "Model gateway unreachable." } }, 502);
  }

  const text = await upstream.text();
  return new Response(text || JSON.stringify({ error: { message: "Empty upstream response." } }), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json", ...CORS_HEADERS },
  });
});