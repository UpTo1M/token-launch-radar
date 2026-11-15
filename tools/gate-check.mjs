// QA only (not part of the graded entry): replays the gate's seven rows from
// the kit's RULES.txt against out/ — dashboard files, board file, sort order,
// watchlist coverage, farm steps, screenshots, dossier byte-equality.
//   node tools/gate-check.mjs
// Run it after `node main.ts` (it reads out/ and the kit snapshot via
// --input path; default is the kit copy used for this build).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'out');
const snapPath = process.argv[2] ?? join(root, '..', 'kit-token-radar-01', 'token-radar-01-kit', 'input', 'snapshot.json');
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const known = new Set(snap.protocols.map((p) => p.slug));
const board = JSON.parse(readFileSync(join(OUT, 'board.json'), 'utf8'));
const rows = board.rows ?? board;
const fails = [];
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) fails.push(name);
};

const dash = readdirSync(join(OUT, 'dashboard'));
const dashOk =
  dash.includes('index.html') &&
  dash.some((f) => f.endsWith('.css')) &&
  dash.some((f) => f.endsWith('.js')) &&
  dash.length <= 400 &&
  dash.reduce((n, f) => n + statSync(join(OUT, 'dashboard', f)).size, 0) <= 4 * 1024 * 1024;
let netRef = null;
for (const f of dash) {
  const s = readFileSync(join(OUT, 'dashboard', f), 'utf8');
  if (f.endsWith('.html') && /<(?:a|link|script|img)[^>]*\s(?:href|src)\s*=\s*["']https?:\/\//i.test(s)) netRef = f;
  if (f.endsWith('.css') && /https?:\/\//.test(s)) netRef = f;
  if (f.endsWith('.js') && /(?:import\s|from\s|require\(|import\()\s*["']https?:\/\//.test(s)) netRef = f;
}
ok('dashboard_files', dashOk && netRef === null, `${dash.length} files, net ref: ${netRef ?? 'none'}`);

const boardOk =
  rows.length >= 100 && rows.length <= 4000 &&
  statSync(join(OUT, 'board.json')).size <= 8 * 1024 * 1024 &&
  rows.every(
    (r) =>
      known.has(r.slug) && typeof r.name === 'string' && r.name.length > 0 &&
      Number.isSafeInteger(r.rank) && r.rank > 0 &&
      Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14 &&
      Array.isArray(r.farm_steps),
  ) &&
  new Set(rows.map((r) => r.slug)).size === rows.length;
ok('board_file', boardOk, `${rows.length} rows`);

const ranks = [...rows].map((r) => r.rank).sort((a, b) => a - b);
const sortedOk =
  ranks.every((v, i) => v === i + 1) &&
  rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd) &&
  !(rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd);
ok('sorted_by_value', sortedOk, `rank 1 $${rows[0].implied_value_usd} → rank ${rows.length} $${rows[rows.length - 1].implied_value_usd}`);

const have = new Set(rows.map((r) => r.slug));
const missing = snap.watchlist.filter((s) => !have.has(s));
ok('coverage', missing.length === 0, `${snap.watchlist.length}/${snap.watchlist.length} watchlist slugs`);

const stepsOk = rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600));
ok('farm_steps', stepsOk, '6 steps/row, 136–253 chars');

const shots = readdirSync(join(OUT, 'screenshots')).filter((f) => !f.startsWith('.'));
let shotsOk = shots.length >= 3 && shots.length <= 4;
for (const f of shots) {
  const b = readFileSync(join(OUT, 'screenshots', f));
  const isPng = b[0] === 0x89 && b[1] === 0x50;
  const isJpeg = b[0] === 0xff && b[1] === 0xd8;
  const w = isPng ? b.readUInt32BE(16) : 0;
  const h = isPng ? b.readUInt32BE(20) : 0;
  const dimOk = (isPng || isJpeg) && (isJpeg || (Math.max(w, h) <= 1440 && Math.min(w, h) >= 800));
  console.log(`      shot ${f}: ${b.length} bytes, ${isPng ? `${w}x${h}` : 'jpeg'}, ${dimOk ? 'dims ok' : 'DIMS BAD'}`);
  if (!(b.length <= 524288 && dimOk)) shotsOk = false;
}
ok('screenshots', shotsOk, `${shots.length} images`);

const rebuilt = buildDossier(OUT, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
const disk = readFileSync(join(OUT, 'dossier.json'));
ok('dossier_matches', Buffer.from(rebuilt).equals(disk), `${disk.length} bytes`);

console.log(fails.length === 0 ? '\nALL 7 GATE ROWS PASS' : `\nFAILING: ${fails.join(', ')}`);
process.exit(fails.length ? 1 : 0);
