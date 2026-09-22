# Exotic ⬡◈

**Guess the 4-digit password. Crack the vault.**

A complete HTML5 / CSS / JavaScript single-page puzzle game — no build step, no
frameworks, no dependencies. Every puzzle reduces to one digit (0–9), four
puzzles make one cipher, and the vault only opens when you have the code.

The game splits cleanly into two realms, each with its own wallet, shop,
profile, history and auth:

| Realm | Currency | Connotation | Opposite currency |
|-------|----------|-------------|-------------------|
| **Shards** ⬡ | single-player solo vaults | the streak, the pride | Cores ◈ |
| **Cores** ◈ | multiplayer races | duels, squads, sabotage | Shards ⬡ |

> Shards and Cores never cross realms. A hint bought in Shards cannot be spent
> in a race; a Scan bought in Cores never leaves the lobby.

---

## Run it

No build step. Any static file server works — even `file://` for pure offline
play (the full game runs on `localStorage`).

```sh
# option A — built-in static server (python)
python -m http.server 8531
# then open http://127.0.0.1:8531/index.html

# option B — one-line node static server
npx serve .
```

The app is a classic script-tag SPA. `index.html` loads `assets/js` in a fixed
order (`core → fx → net → data → game → ui → views → app.js`) and the router
mounts views into `#app-root` — navigating never reloads the page, so the
live boards, locks and realtime channels keep running.

### Offline vs connected

- **Offline (default)** — everything is served by `localStorage` under the
  `exotic.v1.` prefix: profiles, wallets, inventories, history, saved runs and
  the AI cache. Paste nothing, connect nothing, and the game is complete:
  solo vaults, the daily cipher, hotseat multiplayer, the shop, the guide.
- **Connected (optional)** — open **Settings**, paste your Supabase project URL
  + anon key (and optionally an OpenRouter key), hit *Save connections* and the
  same code paths transparently switch to the cloud. Both realms get their own
  auth, and rooms switch from hotseat to live realtime lobbies.

---

## Supabase

The `supabase/` folder is a complete project you can run locally or push:

```sh
# local dev (needs the Supabase CLI)
supabase init
supabase start          # applies migrations + functions automatically
# get your URL + anon key from: supabase status

# hosted
supabase link --project-ref <ref>
supabase db push
supabase functions deploy oracle puzzle-serve puzzle-verify
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
```

### Migrations

| File | Contents |
|------|----------|
| `0001_realm_core.sql` | `sp_*` and `mp_*` profiles / inventory / history / runs, the server-side `catalog_items` mirror, the three RPCs, RLS, realtime publication |
| `0002_multiplayer.sql` | `mp_rooms`, `mp_room_players`, `mp_room_events`, `mp_chat`, `mp_results` (+ shop watcher tables), RLS gated to seated players, realtime publication |

Server-side currency is authoritative through three security-definer RPCs that
mirror exactly what `assets/js/net/cloud.js` calls:

- `grant_currency(p_realm, p_amount, p_reason)` — returns the **new balance**
  (integer) after adding a clamped reward.
- `spend_currency(p_realm, p_amount, p_reason)` — debits the wallet, raising
  SQLSTATE `22000` (→ HTTP 400) when funds run short; the client converts that
  exact status into *"Not enough currency."*
- `purchase_item(p_item_id)` — validates against `catalog_items`, checks the
  correct realm's wallet, enforces stack caps and returns
  `{ balance, currency, item_id, quantity }`.

> ⚠️ **Demo-grade rewards.** `grant_currency` trusts the client for the amount a
> run earned (clamped to 5000/call). For a production leaderboard, compute the
> payout inside a `SECURITY DEFINER` function instead and hand the client a
> signed receipt. The plumbing here is deliberately small so it is easy to
> replace.

### Edge functions

All three are `verify_jwt = false` and self-gate on the anon key / user JWT
(see `functions/_shared/cors.ts`):

| Function | Purpose |
|----------|---------|
| `oracle` | OpenRouter proxy — forwards the client's chat payload, keeps the paid key server-side as the `OPENROUTER_API_KEY` secret. The client's free-model ladder rotates on 429/5xx. |
| `puzzle-serve` | Server-authoritative daily vault: 4 puzzles per date, deterministic and identical for everyone. |
| `puzzle-verify` | Validates one slot's answer server-side; the digit is only returned when correct. |

### Realtime

The `supabase_realtime` publication carries `mp_rooms`, `mp_room_players`,
`mp_room_events`, `mp_chat`, `mp_results` (the room pipelines in
`assets/js/net/realtime.js`) plus both realms' `profiles` and `inventory` for
live wallet/leaderboard updates.

---

## Playing

- **Solo vaults** (`#/play`) — pick a tier (Warm Up → True Nightmare), crack
  the four puzzles before the clock dies, then submit the 4-digit code. Hints
  cost Shards; the shop sells power-ups, perks and cosmetics that change how a
  run feels. Streaks, perfects and no-hint wins feed the badge track.
- **Daily cipher** — one seeded vault per calendar day for the whole world (a
  deterministic date seed). A streak guard survives interruption.
- **Multiplayer** (`#/multi`) — host a room or join a 5-letter code; duels,
  squads, blitz and co-op races run the same seeded cipher over realtime.
  Sabotage items (Ward, Cloak, Fog, Freeze…) are the fun part. With no
  connection the lobby degrades to an honest **hotseat** — same seeded vault,
  one seat at a time, real scoring, zero accounts.

### The Oracle (AI)

The in-game oracle answers riddles when you don't have a nudge left. It runs
on a **free-model ladder** across OpenRouter (`assets/js/net/ai.js`): a model
that rate-limits or times out is cooled down and the next request automatically
rolls to the next free model. Enable *AI proxy* in Settings to route those calls
through your Supabase `oracle` function instead of hitting OpenRouter directly.

---

## Project layout

```
index.html                       # markup, script order, boot screen, canvases
assets/css/                      # tokens, base, components, views, motion
assets/js/
  core/                          # dom, util, emitter, router, store, config,
  fx/                            # vector field, confetti burst, vault dial
  net/                           # supabase client, realtime, oracle, clouds
  data/                          # puzzle bank, shop catalogue, badges
  game/                          # puzzle engine, scoring, session, profile,
  ui/                            # keypad, modal, toast, widgets, vault dial
  views/                         # one file per route (home … multi-room)
  app.js                         # bootstrap: chrome, wallets, routes, theme
supabase/
  config.toml                    # local/hosted project config
  migrations/                    # 0001 realm core · 0002 multiplayer
  functions/                     # oracle, puzzle-serve, puzzle-verify, _shared
tools/                           # dev-only contract + export scanners
```

### Principle of the code

Everything hangs off a single namespace, `Exotic` (`window.Exotic`, alias `X`).
Views are plain objects with the router contract
`mount(outlet, ctx) / render(ctx) / unmount(outlet, ctx)` — no framework, no
virtual DOM. Icons are inline SVG strings; styling is monochrome contrast with
rounded-rect (shadcn-cadence) controls, no borders, no outlines, no gradients.

---

## Development

```sh
# verify every script parses (Windows PowerShell uses ; instead of &&)
node --check assets/js/app.js; (Get-ChildItem assets/js -Recurse -Filter *.js) `
  | ForEach-Object { node --check $_.FullName }

# regenerate the public contract map (what each file exports)
node tools/scan-contract.js > contract.txt
```

### Locales and RTL

The app ships with 150 generated BCP-47 locale packs in `assets/locales/`.
Missing values intentionally fall back to English, so the UI remains usable
while a translation pack is being completed. The runtime translates text,
placeholders, titles, labels and accessibility attributes, and Arabic locale
variants automatically set `dir="rtl"` for the complete shell and controls.

Regenerate the packs and source-string manifest with:

```sh
node tools/generate-locales.mjs
```

To populate the extracted strings through a LibreTranslate-compatible service,
pass its endpoint and optional key. Translation is batched in groups of 50:

```sh
node tools/generate-locales.mjs --endpoint https://translate.example/translate --key "$TRANSLATE_API_KEY"
```

Smoke-tested flows (headless browser, zero console errors): boot & home, all 11
routes, a full solo run (solve → unlock → dial → Shards credited), save/resume,
hints and power-ups, the shop and live wallet updates, settings switches and
theme persistence, and a 4-seat hotseat race through to final standings.