# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/upto1m/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/upto1m/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol that **records no token yet**, ranked by what its launch would be worth if its record stayed as it is — plus a concrete farm plan for each one. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

**Status: ready to submit — NOT submitted.** The repository still needs to be created on GitHub under `upto1m` and pushed (see [Submitting](#submitting)).

## The board

- **198 protocols ranked** (snapshot of 2026-11-14): all **40 watchlist** protocols plus **158 early finds** — every other pre-token protocol the snapshot can rank, at any TVL.
- **Top of the board:** Steakhouse Financial ($642.5M implied), Sentora Curator ($608.5M), Gauntlet ($385.6M), Veda ($357.9M), USDD ($181.1M).
- **Total implied value on the board:** $4.82B.
- Wrapped, staked and bridged products of tokens that already trade (WBTC, Binance staked ETH, bridges, CEXs, versioned pools) are **excluded** — they are not protocols waiting on a launch of their own.
- Tokenized protocols are kept apart and shown at the market's own value in the “market yardstick” table, never mixed into the ranked board.

## The model — peer multiples, computed from the snapshot itself

No multiple is hard-coded and no protocol name is ever special-cased; the same function scores every row:

```
implied = TVL × peer multiple × growth factor × tenure factor × chains factor
```

- **Peer multiple** — the median market-cap-to-TVL ratio of the tokenized protocols in the same DefiLlama category, used only where at least three tokenized peers set it; thinner categories use the global median (0.21×), so one outlier peer cannot set a category. Clamped to 0.05–1.50×.
- **Growth factor** — 1 + 0.6 × 7-day TVL change, change clamped to −50%..+100%.
- **Tenure factor** — 0.85 + 0.30 × min(age, 4y) / 4y; a long track record with no token yet scores up to 1.15×, a new listing 0.85×, unknown listing date 1.00×.
- **Chains factor** — 1 + 0.03 per extra chain, up to five (+15%).

Each row also carries a one-sentence “why it ranks here” derived from its own figures, and a six-step farm plan (wallet setup, the category-specific core action, weekly rhythm, hold window, points check, farm log) with what each step costs and how long it takes. Farm plans are generated from the protocol's category, chains, TVL and age — never from a hand-written list of names.

Read it honestly: “records no token” is what DefiLlama's record says, not proof a token does not exist, and the implied value is this radar's own claim — it does not predict whether or when any protocol issues a token.

## The dashboard

A static page — no framework, no network. Open `out/dashboard/index.html` (after running below) or serve the `dashboard/` folder beside `out/data.js`:

- **Board** — sortable by rank, TVL, 7-day change, age or name; filterable by search text, category, chain, minimum TVL, and watchlist-only.
- **Detail view** — click any row (or open `#slug=<slug>`) for the protocol's stats, the factor-by-factor build-up of its implied value, why it ranks where it does, and its six-step farm plan.
- **Market yardstick** — the biggest tokenized protocols with their mcap/TVL ratios, the source of the peer multiples.
- **Methodology** — the formula, the constants, and the caveats, on the page itself.

## Run it

Requires Node.js 22.18 or later (tested on Node v24.22.1). No dependencies, no network, no keys.

```sh
# From this repository root, with the sealed snapshot at ../input/snapshot.json
# (the competition kit's input/ — get the kit at https://make.fun/c/token-radar-01/kit):
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

# Then open the dashboard:
#   out/dashboard/index.html        (data lives in out/data.js beside it)
```

`main.ts` reads the snapshot, writes `out/board.json` (198 rows), `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with the vendored make.fun library. The program is deterministic: two runs write byte-identical output.

## Verify it

```sh
node tools/verify-steps.mjs   # dashboard regenerates board.json's farm plans exactly (198/198 rows)
node tools/gate-check.mjs     # replays the gate's seven rows against out/ — all pass
```

Screenshots (`screenshots/`, 1440×900 PNG, ~165–175 KB each) were taken in headless Chromium (CDP) from the built dashboard: `1-board.png` the board, `2-detail.png` the detail view for #1 Steakhouse Financial (`#slug=steakhouse-financial`), `3-filtered.png` the board filtered to Lending (`#cat=Lending`).

## Files

| Path | What it is |
| --- | --- |
| `main.ts` | Entrypoint (Node 22, stdlib only): snapshot in, `board.json` + `data.js` + `dossier.json` out |
| `lib/model.ts` | The peer-multiple model, farm-plan generator, snapshot parser, board validation |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied verbatim from the competition kit (required) |
| `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` | The static dashboard (no network) |
| `out/data.js` | Generated at build time — compact rows the page renders (not checked in; regenerated by `main.ts`) |
| `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` | The three required screenshots |
| `tools/verify-steps.mjs`, `tools/gate-check.mjs` | QA scripts (see Verify it) |
| `.makefun/owner.json` | Claim file naming the linked payout wallet |
| `RUN_RECORD.md`, `SESSION.md` | How this entry was built |

## Data source

The sealed snapshot is DefiLlama's public protocols endpoint (`https://api.llama.fi/protocols`), fetched once by make.fun on 2026-11-14T01:18:33Z: 758 protocols at or above $5M TVL, watchlist floor $50M. The snapshot is read-only input; this repository ships no copy of it (the grader mounts its own at `/input/snapshot.json`).

## Submitting

This entry is **not submitted**. To submit (owner only):

1. Create the public GitHub repository `upto1m/token-launch-radar` (created after the competition opened, 2026-11-14T10:00:00Z) and push this directory as its first commit.
2. Bundle the agent transcripts with the kit CLI and submit via `node cli/makefun.mjs submit --competition token-radar-01 --repo-url https://github.com/upto1m/token-launch-radar --commit <sha> --title "Token Launch Radar" --bundle transcripts.tar.gz --keypair <wallet.json>` — the entry must be signed by the wallet in `.makefun/owner.json` (`BW3BNonTDhhEFUwwMKFJ3ZxGVqwi9vAzGtGgxt8Wfys1`), which is linked to the make.fun account `@upto1m`.
3. Deadline: Mon 14 Dec 2026 17:00 WIB (10:00 UTC). At most 5 submissions a day, 10 in all.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tvfbjxfd&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
