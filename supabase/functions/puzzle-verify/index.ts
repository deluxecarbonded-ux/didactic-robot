// Exotic — puzzle-verify
// Checks a submitted answer for one slot of the day's vault without ever
// leaking the other slots. The correct digit is only returned when the answer
// is right (the client then reveals it on the board).
//
//   POST /functions/v1/puzzle-verify
//   { date, slot: 0-3, answer: string|number }
//   -> { ok, correct, digit?, explanation? }

import { CORS_HEADERS, gate, json } from "../_shared/cors.ts";
import { dailyVault, today } from "../_shared/bank.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: { message: "Method not allowed." } }, 405);
  }

  const g = await gate(req);
  if (!g.ok) return json(g.body ?? { error: { message: "Unauthorized." } }, g.status);

  let input: { date?: string; slot?: number; answer?: string | number };
  try {
    input = await req.json();
  } catch {
    return json({ error: { message: "Body must be JSON." } }, 400);
  }

  const date = today(input.date || null);
  const slot = Number(input.slot);
  const answer = Number(String(input.answer ?? "").trim());

  if (!Number.isInteger(slot) || slot < 0 || slot > 3) {
    return json({ error: { message: "slot must be an integer 0-3." } }, 400);
  }
  if (!Number.isInteger(answer) || answer < 0 || answer > 9) {
    return json({ error: { message: "answer must be a single digit 0-9." } }, 400);
  }

  const vault = dailyVault(date, 4);
  const puzzle = vault.slots[slot];
  const correct = puzzle.digit === answer;

  return json({
    ok: true,
    correct,
    ...(correct
      ? { digit: puzzle.digit, explanation: puzzle.explanation }
      : { explanation: puzzle.explanation }),
  });
});