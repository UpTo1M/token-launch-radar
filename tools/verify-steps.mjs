// QA only (not part of the graded entry): checks that dashboard/app.js
// regenerates exactly the farm steps and why-lines lib/model.ts wrote into
// board.json, for every row.
//   node tools/verify-steps.mjs
// Run it after `node main.ts` (it reads out/board.json and out/data.js).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const board = JSON.parse(readFileSync(join(root, 'out/board.json'), 'utf8')).rows;
const radar = JSON.parse(readFileSync(join(root, 'out/data.js'), 'utf8').replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
const appJs = readFileSync(join(root, 'dashboard/app.js'), 'utf8');

// Slice out the pure functions (they touch no DOM): rows..whyFor.
const start = appJs.indexOf('const rows = D.rows;');
const end = appJs.indexOf('/* ---- static setup ---- */');
if (start < 0 || end < 0) { console.error('markers not found'); process.exit(2); }
const { farmStepsFor, whyFor } = new Function('D', `${appJs.slice(start, end)}; return { farmStepsFor, whyFor };`)(radar);

let stepBad = 0, whyBad = 0;
const rowBySlug = new Map(radar.rows.map((r) => [r[1], r]));
for (const b of board) {
  const r = rowBySlug.get(b.slug);
  if (!r) { console.error('missing in data.js:', b.slug); stepBad++; continue; }
  const steps = farmStepsFor(r);
  if (steps.length !== b.farm_steps.length || steps.some((s, i) => s !== b.farm_steps[i])) {
    stepBad++;
    if (stepBad <= 2) {
      console.error('STEP MISMATCH', b.slug);
      steps.forEach((s, i) => { if (s !== b.farm_steps[i]) { console.error(' app :', s); console.error(' board:', b.farm_steps[i]); } });
    }
  }
  if (whyFor(r) !== b.why) {
    whyBad++;
    if (whyBad <= 2) { console.error('WHY MISMATCH', b.slug, '\n app :', whyFor(r), '\n board:', b.why); }
  }
}
console.log(`rows checked: ${board.length}, step mismatches: ${stepBad}, why mismatches: ${whyBad}`);
process.exit(stepBad || whyBad ? 1 : 0);
