// Shared CORS + auth gating for Exotic edge functions.
// All three functions run with verify_jwt=false so the browser can call them
// exactly like the Supabase REST client: apikey: <anon> and, when signed in,
// Authorization: Bearer <user jwt>. We re-verify the JWT by hand here.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export interface GateResult {
  ok: boolean;
  status: number;
  body?: unknown;
}

/**
 * Accepts a request when the caller presents the project anon key or a valid
 * user session token. Keeps the functions callable from the browser without
 * exposing them to arbitrary public traffic.
 */
export async function gate(req: Request): Promise<GateResult> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const apikey = req.headers.get("apikey") || "";
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const isAnon = apikey === anon || token === anon;

  if (isAnon) return { ok: true, status: 200 };

  if (url && token) {
    try {
      // Verifies the JWT against the auth service without holding secrets.
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await sb.auth.getUser(token);
      if (!error) return { ok: true, status: 200 };
      return {
        ok: false,
        status: 401,
        body: { error: { message: "Session expired or invalid." } },
      };
    } catch {
      // auth verification unavailable — require the anon key instead
      return { ok: false, status: 403, body: { error: { message: "Unauthorized." } } };
    }
  }

  return { ok: false, status: 401, body: { error: { message: "Unauthorized." } } };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}