# Run record — Token Launch Radar (make.fun `token-radar-01`)

## Opening prompt

The task as handed to this agent by its parent orchestrator (Sun 15 Nov 2026 ~21:43 WIB):

> Build a make.fun bounty entry for “Build the best token launch radar” ($1,325, deadline Mon 14 Dec 2026 17:00 WIB). Fetch the brief from the make.fun bounty page and the requirements JSON, read the general rules at make.fun/skill.md, and build the token launch radar exactly as the brief specifies. Work dir: ~/workspace/makefun/token-launch-radar/. Deliverables: source code (main.ts at root, Node), README.md, RUN_RECORD.md, SESSION.md, LICENSE (MIT). Use free public data sources, test it by actually running it and verifying it detects/lists real recent launches. Do NOT submit, push, or upload anything anywhere (no GitHub credentials). Do NOT claim the bounty is entered/submitted. Do NOT pay anything. Do NOT make any on-chain transaction. Do NOT put any secret/key in any file.

## Account

- make.fun account **@upto1m** (Muhammad Alfarisi), GitHub `upto1m`, profile https://make.fun/profile
- Linked Solana wallet (Phantom, public address only): `BW3BNonTDhhEFUwwMKFJ3ZxGVqwi9vAzGtGgxt8Wfys1` — also recorded in `.makefun/owner.json`
- Referral link: https://make.fun/r/tvfbjxfd (inviter @setyamickala)
- No secrets, keys, passwords, seeds or private keys were used, requested, or stored anywhere in this build.

## Setup

- Harness: Muse (Muse Spark 1.3), running as a subagent; this session built the whole entry.
- Machine: Linux VM, Node.js **v24.22.1** (`/usr/bin/node`, satisfies the ≥22.18 requirement), no extra packages installed (Node standard library only).
- Browser for screenshots: the VM's Chromium (`/opt/meta-chromium/chrome`, 157.0.8103.77), driven headless over CDP from a small Node script (`/tmp/shot.mjs`, not part of the entry). The build refuses to start without its WebGL domain policy, so it was launched with a policy file (`hatch-webgl-allowed-domains-v1` + `example.com`) and its SHA-256 switches. One-shot `--screenshot`/`--dump-dom` exited silently in this build; CDP with `Page.captureScreenshot` worked.
- Data: the competition kit (`https://make.fun/c/token-radar-01/kit`, downloaded 2026-11-15) — `RULES.txt`, `competition.yaml`, `input/snapshot.json` (DefiLlama protocols snapshot, fetched 2026-11-14T01:18:33Z, 758 protocols, watchlist floor $50M) and the starter. The kit lives outside this repository at `~/workspace/makefun/kit-token-radar-01/`; the snapshot is read-only input and is not shipped in the repo (the grader mounts its own at `/input/snapshot.json`).
- The starter (`starter/`) was read to learn the I/O contract (`main.ts` flags, `vendor/makefun-board.ts` API, `data.js` layout). Its model, farm plans and dashboard were **not** copied: the starter is the house's second fixed dashboard, so this entry's model (peer multiples), farm plans and page are all written from scratch. `vendor/makefun-board.ts` is copied verbatim as the kit instructs (“Copy it to vendor/makefun-board.ts in your repository”), and `LICENSE` is a fresh MIT license in the entrant's name.

## Tools used

- `browser.open` — bounty page + skill.md (brief, rules).
- `curl` — requirements JSON (`GET /api/competitions/token-radar-01/requirements`) and the kit tarball.
- `node main.ts` — the entry itself (build + gate self-check via `boardIssue`).
- `node tools/verify-steps.mjs`, `node tools/gate-check.mjs` — QA scripts written in this session (in-repo under `tools/`).
- Headless Chromium over CDP — the three screenshots.
- `git` was **not** used (no repo created, nothing pushed — submission is the owner's step).
- MCP servers used: none.
