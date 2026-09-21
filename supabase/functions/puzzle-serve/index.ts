// Exotic — puzzle-serve
// Returns the daily vault for a calendar date: four puzzles, one code digit
// each, deterministic per date and identical for every player. The client
// normally builds this locally from its own bank; this endpoint is the
// server-authoritative version used when the app is connected.
//
//   GET  /functions/v1/puzzle-serve?date=2026-09-21
//   ->   { date, code, slots: [{ category, difficulty, kind, prompt, digit,
//                                explanation, choices? }] }

import { CORS_HEADERS, gate, json } from "../_shared/cors.ts";
import { dailyVault, today } from "../_shared/bank.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return json({ error: { message: "Method not allowed." } }, 405);
  }

  const g = await gate(req);
  if (!g.ok) return json(g.body ?? { error: { message: "Unauthorized." } }, g.status);

  const url = new URL(req.url);
  const date = today(url.searchParams.get("date"));

  return json(dailyVault(date, 4));
});