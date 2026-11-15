/* Token Launch Radar — dashboard logic (no network, no framework).
 *
 * THE MODEL (peer multiples, computed from the snapshot itself — see
 * lib/model.ts, the program that wrote data.js):
 *   peer multiple = median(mcap_usd / tvl_usd) of the tokenized protocols in
 *     the same category, used only where at least three tokenized peers set
 *     it (thinner categories take the global median), clamped to 0.05..1.50.
 *     No multiple is hard-coded, no protocol name is ever special-cased:
 *     the same function scores every row.
 *   implied = TVL x peer multiple x growth factor x tenure factor x chains
 *     factor, where growth = 1 + 0.6 x clamp(7d change, -50%, +100%),
 *     tenure = 0.85 + 0.30 x min(age, 4y) / 4y (unknown age: 1.00), and
 *     chains = 1 + 0.03 per extra chain up to five.
 *   A row's farm plan is generated here from its own figures (category,
 *     chains, TVL, age) by farmStepsFor() — the same six steps, word for
 *     word, that main.ts wrote into board.json for that row.
 *
 * DATA: window.RADAR from data.js. One row is
 *   [rank, slug, name, category, chains, tvl, chg7d, ageDays, implied,
 *    peerMult, growthF, tenureF, chainsF, watchlist]
 * with chains joined by "|". One live row is
 *   [name, category, tvl, mcap, mcap/TVL].
 */
'use strict';
const D = window.RADAR;
const $ = (id) => document.getElementById(id);
const rows = D.rows;
const bySlug = new Map(rows.map((r) => [r[1], r]));
const tvlRank = new Map([...rows].sort((a, b) => b[5] - a[5]).map((r, i) => [r[1], i + 1]));
const maxImplied = rows.length ? rows[0][8] : 1;

const commas = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const shortUsd = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => v === null ? '&mdash;' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const pctCls = (v) => v === null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
const ageTxt = (a) => a === null ? '&mdash;' : a >= 365 ? Math.floor(a / 365) + 'y ' + Math.floor((a % 365) / 30) + 'mo' : a + 'd';

/* ---- farm plan: the same six steps lib/model.ts writes to board.json ---- */
function capitalFor(tvl) { return tvl >= 5e9 ? 500 : tvl >= 1e9 ? 250 : tvl >= 1e8 ? 100 : 50; }
function holdFor(age) { return age === null ? 60 : age < 180 ? 90 : age < 365 ? 60 : 45; }
function actionFor(name, cat, capital, chain) {
  const c = (cat || '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateralized')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as a lender and leave the deposit earning.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
  if (c.includes('yield') || c.includes('yield aggregator')) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and hold the vault shares.';
  if (c.includes('bridge') || c.includes('cross chain')) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
  if (c.includes('staking') || c.includes('restak')) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' on ' + chain + ' and keep the receipt token.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
  if (c.includes('rwa')) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.';
  if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and keep it parked.';
  if (c.includes('prediction')) return 'Fund ' + name + ' with $' + capital + ' and take one position in an open market.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
  if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
  if (c.includes('farm')) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main farm on " + chain + ' and keep it staked.';
  return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
}
function farmStepsFor(r) {
  const name = r[2], chain = (r[4].split('|')[0] || 'its main chain');
  const capital = capitalFor(r[5]), hold = holdFor(r[7]), gas = capital >= 250 ? 8 : 4;
  return [
    'Open a fresh wallet that will only hold this farm\'s funds, and write its recovery phrase on paper kept offline, never in a screenshot or a chat. Cost: nothing to create, about $2 of gas for the first transaction. Time: 10 minutes to set up.',
    actionFor(name, r[3], capital, chain) + ' Cost: $' + capital + ' of capital plus about $' + gas + ' of gas. Time: 15 minutes to set up.',
    'Come back once a week and do one real action \u2014 a deposit, a swap, a borrow, a vote or a claim \u2014 so the wallet reads as an active user rather than a one-off deposit. Cost: about $2 of gas a week. Time: 10 minutes a week.',
    'Leave the position untouched for at least ' + hold + ' days so the activity is counted across more than one snapshot. Cost: the $' + capital + ' stays locked in the position. Time: ' + hold + ' days.',
    'Once a month, open the protocol\'s own rewards or points page from its official site or docs and check this wallet\'s standing; never connect the wallet from a link in a DM or a reply. Cost: nothing to check, and never pay to claim. Time: 10 minutes.',
    'Keep a one-page farm log \u2014 wallet address, dates, amounts and transaction hashes \u2014 and only unwind after the position has aged past the hold window, since withdrawing early can erase the activity that counted. Cost: nothing but the log. Time: 5 minutes.',
  ];
}
function whyFor(r) {
  const parts = [];
  const tr = tvlRank.get(r[1]) || rows.length;
  parts.push(tr <= 10 ? 'Top-10 TVL among the ' + rows.length + ' pre-token protocols on this board' : tr <= 50 ? 'Top-50 TVL among the ' + rows.length + ' pre-token protocols on this board' : '$' + commas(r[5]) + ' of TVL');
  if (r[6] !== null && r[6] > 0) parts.push('TVL up ' + r[6].toFixed(1) + '% in 7 days');
  else if (r[6] !== null && r[6] < 0) parts.push('TVL down ' + Math.abs(r[6]).toFixed(1) + '% in 7 days');
  if (r[7] !== null && r[7] >= 365) parts.push('tracked for ' + Math.floor(r[7] / 365) + 'y ' + Math.floor((r[7] % 365) / 30) + 'mo with no token recorded');
  else if (r[7] !== null) parts.push('tracked for ' + r[7] + ' days with no token recorded');
  else parts.push('no listing date recorded');
  parts.push('its category\'s peer multiple is ' + r[9].toFixed(2) + 'x TVL');
  return parts.join('; ') + '.';
}

/* ---- static setup ---- */
$('asOf').textContent = D.as_of;
$('peerGlobal').textContent = D.peer_global.toFixed(2);
$('modelVer').textContent = D.model_version;
$('source').textContent = D.source + ' · watchlist floor $' + commas(D.floor_usd) + ' · ' + D.watchlist_size + ' protocols on the watchlist, ' + D.early_size + ' early finds below it.';
$('stats').innerHTML = [
  [commas(D.board_size), 'pre-token protocols ranked'],
  [commas(D.watchlist_size), 'on the watchlist (TVL $50M+, no token recorded)'],
  [shortUsd(D.total_implied_usd), 'total implied value on the board'],
  [esc(D.as_of), 'snapshot date (UTC)'],
].map((s) => '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>').join('');
const cats = [...new Set(rows.map((r) => r[3]).filter(Boolean))].sort();
const chains = [...new Set(rows.flatMap((r) => r[4].split('|')).filter(Boolean))].sort();
for (const c of cats) $('cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
for (const c of chains) $('chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>');
$('live').innerHTML = '<thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>mcap / TVL</th></tr></thead><tbody>' +
  D.live.map((l) => '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[1] || '—') + '</td><td class="num">' + shortUsd(l[2]) + '</td><td class="num">' + shortUsd(l[3]) + '</td><td class="num">' + l[4].toFixed(2) + 'x</td></tr>').join('') + '</tbody>';

/* ---- filtering, sorting, rendering ---- */
const state = { q: '', cat: '', chain: '', minTvl: 0, watchlist: false, sort: 'rank', slug: null };
function filtered() {
  const q = state.q.trim().toLowerCase();
  let out = rows.filter((r) =>
    (!state.watchlist || r[13] === 1) &&
    r[5] >= state.minTvl &&
    (!state.cat || r[3] === state.cat) &&
    (!state.chain || r[4].split('|').includes(state.chain)) &&
    (!q || r[2].toLowerCase().includes(q) || r[1].toLowerCase().includes(q) || (r[3] || '').toLowerCase().includes(q)));
  const by = {
    rank: (a, b) => a[0] - b[0],
    tvl: (a, b) => b[5] - a[5],
    chg: (a, b) => (b[6] === null ? -1e9 : b[6]) - (a[6] === null ? -1e9 : a[6]),
    age: (a, b) => (b[7] === null ? -1 : b[7]) - (a[7] === null ? -1 : a[7]),
    name: (a, b) => a[2].localeCompare(b[2]),
  }[state.sort];
  return out.sort(by);
}
function render() {
  const list = filtered();
  $('count').textContent = list.length + ' of ' + rows.length + ' protocols shown' + (state.watchlist ? ' · watchlist only' : '') + (state.cat ? ' · ' + state.cat : '') + (state.chain ? ' · ' + state.chain : '');
  $('rows').innerHTML = list.map((r) => {
    const ch = r[4].split('|');
    return '<tr data-slug="' + esc(r[1]) + '"' + (state.slug === r[1] ? ' class="sel"' : '') + '>' +
      '<td class="num">' + r[0] + '</td>' +
      '<td><span class="name">' + esc(r[2]) + '</span> <span class="slug">' + esc(r[1]) + '</span>' + (r[13] === 1 ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY</span>') + '</td>' +
      '<td>' + esc(r[3] || '—') + '</td>' +
      '<td>' + esc(ch.slice(0, 2).join(', ')) + (ch.length > 2 ? ' +' + (ch.length - 2) : '') + '</td>' +
      '<td class="num">' + shortUsd(r[5]) + '</td>' +
      '<td class="num ' + pctCls(r[6]) + '">' + pct(r[6]) + '</td>' +
      '<td class="num">' + ageTxt(r[7]) + '</td>' +
      '<td class="num">' + shortUsd(r[8]) + '<div class="bar"><i style="width:' + Math.max(2, Math.round(100 * r[8] / maxImplied)) + '%"></i></div></td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--dim)">No protocol matches these filters.</td></tr>';
  document.querySelectorAll('#rows tr[data-slug]').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
}
function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  state.slug = slug;
  const steps = farmStepsFor(r);
  const chains = r[4].split('|').join(', ');
  $('detail').hidden = false;
  $('detail').innerHTML =
    '<button class="close" id="closeDetail" type="button">Close ✕</button>' +
    '<h2>#' + r[0] + ' — ' + esc(r[2]) + ' <span class="slug">' + esc(r[1]) + '</span>' + (r[13] === 1 ? '<span class="badge wl">WATCHLIST</span>' : '<span class="badge early">EARLY FIND</span>') + '</h2>' +
    '<p class="meta">' + esc(r[3] || 'Uncategorized') + ' · ' + esc(chains) + ' · ' + (r[7] === null ? 'listing date not recorded' : 'tracked since ' + Math.floor(r[7] / 365) + 'y ' + Math.floor((r[7] % 365) / 30) + 'mo ago') + '</p>' +
    '<p class="why">Why it ranks here: ' + esc(whyFor(r)) + '</p>' +
    '<div class="grid">' +
    '<div class="cell"><b>' + shortUsd(r[8]) + '</b><span>implied value</span></div>' +
    '<div class="cell"><b>' + shortUsd(r[5]) + '</b><span>TVL</span></div>' +
    '<div class="cell"><b class="' + pctCls(r[6]) + '">' + pct(r[6]) + '</b><span>TVL change, 7 days</span></div>' +
    '<div class="cell"><b>' + (r[7] === null ? '—' : commas(r[7]) + ' days') + '</b><span>tracked with no token recorded</span></div></div>' +
    '<h3>How the value is built</h3>' +
    '<div class="factors">implied = $' + commas(r[5]) + ' TVL × ' + r[9].toFixed(2) + ' peer multiple × ' + r[10].toFixed(2) + ' growth × ' + r[11].toFixed(2) + ' tenure × ' + r[12].toFixed(2) + ' chains = $' + commas(r[8]) + '</div>' +
    '<h3>Farm plan — six steps</h3><ol>' + steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
  $('closeDetail').addEventListener('click', closeDetail);
  document.querySelectorAll('#rows tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === slug));
  $('detail').scrollIntoView({ behavior: 'auto', block: 'nearest' });
}
function closeDetail() { state.slug = null; $('detail').hidden = true; syncHash(); render(); }
function syncHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.cat) p.set('cat', state.cat);
  if (state.chain) p.set('chain', state.chain);
  if (state.minTvl) p.set('minTvl', String(state.minTvl));
  if (state.watchlist) p.set('watchlist', '1');
  if (state.sort !== 'rank') p.set('sort', state.sort);
  if (state.slug) p.set('slug', state.slug);
  history.replaceState(null, '', '#' + p.toString());
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get('q') || ''; state.cat = p.get('cat') || ''; state.chain = p.get('chain') || '';
  state.minTvl = Number(p.get('minTvl') || 0); state.watchlist = p.get('watchlist') === '1';
  state.sort = p.get('sort') || 'rank'; state.slug = p.get('slug');
}
function bind(id, fn) { $(id).addEventListener('input', () => { fn($(id)); syncHash(); render(); }); }
bind('q', (el) => { state.q = el.value; });
bind('cat', (el) => { state.cat = el.value; });
bind('chain', (el) => { state.chain = el.value; });
bind('minTvl', (el) => { state.minTvl = Number(el.value); });
bind('watchlist', (el) => { state.watchlist = el.checked; });
bind('sort', (el) => { state.sort = el.value; });
$('reset').addEventListener('click', () => {
  Object.assign(state, { q: '', cat: '', chain: '', minTvl: 0, watchlist: false, sort: 'rank', slug: null });
  $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('minTvl').value = '0'; $('watchlist').checked = false; $('sort').value = 'rank';
  closeDetail(); syncHash(); render();
});
document.querySelectorAll('#board th[data-k]').forEach((th) => th.addEventListener('click', () => {
  const map = { rank: 'rank', tvl: 'tvl', chg: 'chg', age: 'age', name: 'name' };
  const s = map[th.dataset.k];
  if (s) { state.sort = s; $('sort').value = s; syncHash(); render(); }
}));
readHash();
$('q').value = state.q; $('cat').value = state.cat; $('chain').value = state.chain;
$('minTvl').value = String(state.minTvl); $('watchlist').checked = state.watchlist; $('sort').value = state.sort;
render();
if (state.slug) openDetail(state.slug);
