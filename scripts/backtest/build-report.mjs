// Builds docs/backtest/report.html from results.json + events.json.
//   node scripts/backtest/build-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('docs/backtest/results.json', 'utf8'));
const events = JSON.parse(readFileSync('docs/backtest/events.json', 'utf8'));
const cur = r.summaries.current;
const v1 = r.summaries.v1;

// Live league numbers (from the scoring run of 2026-11-17, week of Nov 9, all 100 draftable talent).
const LIVE = { draftable: 100, zeroHeat: 51, tiers: { musician: [0, 3, 12, 17], creator: [4, 5, 10, 29], streamer: [3, 7, 2, 8] } };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n, d = 1) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
const date = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' }).replace(/, (\d\d)$/, " '$1");
const dateY = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ev = (w) => events.find((e) => e.week === w.week && e.name === w.name) ?? { verdict: 'open', event: 'Not researched', url: null };

const top = r.topWeeks.map((w) => ({ w, e: ev(w) }));
const counts = top.reduce((a, { e }) => ((a[e.verdict] = (a[e.verdict] ?? 0) + 1), a), {});
const VERDICT = { hit: 'Real event', likely: 'Likely', open: 'No event found' };
const rosterV2 = cur.meanHeat * 10;
const rosterV1 = v1.meanHeat * 10;
const zb = r.zeroBreakdown.current;

const topRows = top
  .map(({ w, e }, i) => {
    const what = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.event)}</a>` : esc(e.event);
    return `<tr><td class="num">${i + 1}</td><td>${esc(w.name)}</td><td class="nowrap">${date(w.week)}</td><td class="num">${fmt(w.heat)}</td><td class="num">${w.ratio}x</td><td><span class="chip chip-${e.verdict}">${VERDICT[e.verdict]}</span></td><td class="ev">${what}</td></tr>`;
  })
  .join('');

const REV = { 'Akaash Singh departure confirmed by Andrew Schulz': 'miss', 'Jasleen and Akaash Singh on the show addressing the controversy': 'late', 'California Sunrise 10th Anniversary Edition': 'miss', 'Announced leaving the Sidemen': 'weak' };
const REVLABEL = { miss: 'Missed', late: 'A week late', weak: 'Weak' };
const REVCHIP = { miss: 'open', late: 'likely', weak: 'likely' };
const revRows = r.reverse
  .map((x) => {
    const k = REV[x.event];
    const a = x.eventWeek, b = x.nextWeek;
    return `<tr><td>${esc(x.name)}</td><td class="nowrap">${date(x.date)}</td><td class="ev">${esc(x.event)}</td><td class="num">${fmt(a.heat)} <span class="sub">${a.ratio}x</span></td><td class="num">${fmt(b.heat)} <span class="sub">${b.ratio}x</span></td><td class="num">${fmt(x.medianHeat)}</td><td><span class="chip chip-${REVCHIP[k]}">${REVLABEL[k]}</span></td></tr>`;
  })
  .join('');
const ak = r.akaash;

const shiftRows = r.shiftCheck
  .map((x) => `<tr><td>${esc(x.name)}</td><td class="ev">${esc(x.event)}</td><td class="num">${fmt(x.unshifted.eventWeek)}</td><td class="num">${fmt(x.unshifted.nextWeek)}</td><td class="num strong">${fmt(x.shifted.eventWeek)}</td><td class="num">${fmt(x.shifted.nextWeek)}</td></tr>`)
  .join('');

const variants = ['current', 'v1', 'shift', 'floor50', 'floor200', 'baseline4'];
const vLabel = { current: 'Heat v2 (live): 15 + 10 × log2', v1: 'Heat v1 (old): 10 × log2, floored at 0', shift: 'v2, Wikipedia days moved back one', floor50: 'v2, floor 50 views/day', floor200: 'v2, floor 200 views/day', baseline4: 'v2, 4-week baseline' };
const vRows = variants
  .map((k) => {
    const s = r.summaries[k];
    return `<tr${k === 'current' ? ' class="current"' : ''}><td>${vLabel[k]}</td><td class="num">${s.zeroWeeksPct}%</td><td class="num">${fmt(s.meanHeat * 10)}</td><td class="num">${fmt(s.season12.p50)}</td><td class="num">${s.capHits}</td></tr>`;
  })
  .join('');

const tierRows = ['musician', 'creator', 'streamer']
  .map((p) => `<tr><td>${p[0].toUpperCase() + p.slice(1)}s</td>${LIVE.tiers[p].map((n) => `<td class="num">${n}</td>`).join('')}<td class="num">${LIVE.tiers[p].reduce((a, b) => a + b, 0)}</td></tr>`)
  .join('');
const tierAll = [0, 1, 2, 3].map((i) => ['musician', 'creator', 'streamer'].reduce((a, p) => a + LIVE.tiers[p][i], 0));

const hist = (() => {
  const heats = r.perTalent.flatMap((t) => t.series);
  const edges = [5, 10, 15, 20, 30, 40, 50];
  const bins = [{ label: '0', count: heats.filter((h) => h === 0).length }];
  let lo = 0;
  for (const hi of edges) {
    bins.push({ label: lo === 0 ? 'under 5' : `${lo}–${hi}`, count: heats.filter((h) => h > 0 && h >= lo && h < hi).length });
    lo = hi;
  }
  bins.push({ label: '50 (cap)', count: heats.filter((h) => h >= 50).length });
  if (bins.reduce((a, b) => a + b.count, 0) !== heats.length) throw new Error('histogram does not add up');
  return bins;
})();

const data = {
  hist,
  weekly: r.weekly,
  annotations: [
    { week: '2025-12-15', label: 'Paul vs Joshua' },
    { week: '2026-02-02', label: 'Grammys + Super Bowl' },
    { week: '2026-05-11', label: 'Drake triple album' },
  ],
};

const html = `<title>DayOnes Heat Backtest</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column of findings; wide tables scroll inside their own frame. A scouting report, not a dashboard. */
:root {
  --bg: #f6f6f3; --surface: #ffffff; --fg: #17181c; --muted: #5d6068; --line: #dcdcd6;
  --heat: #d9480f; --heat-soft: #fbe3d6; --grid: #e7e6e1;
  --good: #1f7a3a; --good-bg: #dcf0e2; --warn: #8a5a00; --warn-bg: #fbecc8; --open: #9b2c2c; --open-bg: #f7e1df;
  --font-display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --font-body: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #131418; --surface: #1b1c21; --fg: #ecebe6; --muted: #a2a4ab; --line: #2e3037;
  --heat: #ff7a3d; --heat-soft: #3a2417; --grid: #26282e;
  --good: #6fd08c; --good-bg: #173322; --warn: #f0c060; --warn-bg: #3a2e12; --open: #f19b94; --open-bg: #3a1c1b; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #131418; --surface: #1b1c21; --fg: #ecebe6; --muted: #a2a4ab; --line: #2e3037;
  --heat: #ff7a3d; --heat-soft: #3a2417; --grid: #26282e;
  --good: #6fd08c; --good-bg: #173322; --warn: #f0c060; --warn-bg: #3a2e12; --open: #f19b94; --open-bg: #3a1c1b; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--font-body); }
.wrap { max-width: 880px; margin: 0 auto; padding-block: 40px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 44px; }
header { display: grid; gap: 10px }
.eyebrow { font: 500 12px/1 var(--font-data); letter-spacing: .08em; text-transform: uppercase; color: var(--heat) }
h1 { font: 800 clamp(30px, 6vw, 44px)/1.05 var(--font-display); margin: 0; letter-spacing: -.01em; text-wrap: balance }
h2 { font: 700 22px/1.2 var(--font-display); margin: 0 0 6px; text-wrap: balance }
p { margin: 0 0 12px; max-width: 68ch }
.lede { font-size: 17px; color: var(--muted); max-width: 64ch }
.meta { font: 13px/1.5 var(--font-data); color: var(--muted) }
section { display: grid; gap: 8px; min-width: 0 }
.findings { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)) }
.finding { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: grid; gap: 6px; align-content: start }
.finding .k { font: 700 28px/1 var(--font-display); color: var(--heat); font-variant-numeric: tabular-nums }
.finding .was { font: 13px var(--font-data); color: var(--muted) }
.finding .t { font-size: 14px; color: var(--muted) }
.formula { font: 500 15px/1.5 var(--font-data); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; overflow-x: auto }
.chart { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 12px 8px; position: relative }
.chart svg { display: block; width: 100%; height: auto; overflow: visible }
.chart .cap { font-size: 13px; color: var(--muted); margin: 0 4px 6px }
.tip { position: absolute; pointer-events: none; background: var(--fg); color: var(--bg); font: 12px/1.4 var(--font-data); padding: 6px 8px; border-radius: 6px; white-space: nowrap; transform: translate(-50%, calc(-100% - 10px)) }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
table { border-collapse: collapse; width: 100%; font-size: 14px }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top }
th { font: 600 12px/1.3 var(--font-data); letter-spacing: .04em; text-transform: uppercase; color: var(--muted); white-space: nowrap }
tr:last-child td { border-bottom: 0 }
td.num, th.num { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; white-space: nowrap }
td.strong { font-weight: 600; color: var(--heat) }
.sub { color: var(--muted); font-size: 12px }
td.nowrap { white-space: nowrap }
td.ev { min-width: 240px; color: var(--muted) }
td.ev a { color: var(--fg) }
tr.current td { background: var(--heat-soft) }
.chip { display: inline-block; font: 500 12px/1.3 var(--font-data); padding: 3px 8px; border-radius: 999px; white-space: nowrap }
.chip::before { margin-right: 4px }
.chip-hit { color: var(--good); background: var(--good-bg) } .chip-hit::before { content: "✓" }
.chip-likely { color: var(--warn); background: var(--warn-bg) } .chip-likely::before { content: "~" }
.chip-open { color: var(--open); background: var(--open-bg) } .chip-open::before { content: "✗" }
.decision { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--heat); border-radius: 10px; padding: 16px 18px }
.decision ol { margin: 0; padding-left: 20px; display: grid; gap: 12px }
ul.plain { margin: 0; padding-left: 20px; display: grid; gap: 6px; max-width: 68ch }
a { color: var(--heat) }
a:focus-visible { outline: 2px solid var(--heat); outline-offset: 2px }
.axis text { font: 11px var(--font-data); fill: var(--muted) }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Backtest · PRD 5g · second pass</div>
    <h1>DayOnes Heat Backtest</h1>
    <p class="lede">Heat now gives every talent a stat line every week. This pass re-runs the year with the new formula and adds the reverse test: for events we know were big, did Heat fire?</p>
    <div class="meta">${r.sample.count} talent (${r.sample.byPosition.musician} musicians, ${r.sample.byPosition.creator} creators, ${r.sample.byPosition.streamer} streamers) · ${r.weeks.count} weeks, ${dateY(r.weeks.first)} to ${dateY(r.weeks.last)} · Wikipedia Heat only · run ${dateY(r.today)}</div>
  </header>

  <section>
    <h2>The new formula</h2>
    <div class="formula">Heat = 15 + 10 × log2(this week ÷ own 8-week average), clamped to 0–50</div>
    <p>Half their normal attention scores 5, a normal week 15, double 25, eight times 45. The 15 is a tuning knob (heatBaselinePoints). The order of who scored more than whom is unchanged.</p>
    <div class="findings">
      <div class="finding"><div class="k">${cur.zeroWeeksPct}%</div><div class="was">was ${v1.zeroWeeksPct}%</div><div class="t">of talent-weeks score 0. ${zb.belowFloor} of the ${zb.total} zeros are talent whose Wikipedia page is too small to count, not quiet weeks.</div></div>
      <div class="finding"><div class="k">${fmt(rosterV2, 0)}</div><div class="was">was ${fmt(rosterV1, 0)}</div><div class="t">Heat points for a 10-talent roster in an average week.</div></div>
      <div class="finding"><div class="k">${r.rankCompare.sameOrder ? 'Same' : 'Changed'}</div><div class="was">top 25 order</div><div class="t">${r.rankCompare.sameSet} of 25 top weeks identical, in the same order. ${r.rankCompare.tiedAtCap} weeks now reach the 50 cap and tie there.</div></div>
      <div class="finding"><div class="k">0 of 4</div><div class="was">reverse test</div><div class="t">known events produced a clear spike in their own week. See below.</div></div>
    </div>
    <p>An average roster lands near ${fmt(rosterV2, 0)}, not 150, because a typical week sits a little under a talent's own average: the average is pulled up by their spikes. The median talent-week scores ${fmt(cur.heatQuantiles.p50)}.</p>
  </section>

  <section>
    <h2>Reverse test: did Heat fire on known events?</h2>
    <p>This is the stronger test. A known big moment with no Heat spike is a worse failure than a noisy week.</p>
    <div class="scroll"><table>
      <thead><tr><th>Talent</th><th>Date</th><th>Event</th><th class="num">Event week</th><th class="num">Next week</th><th class="num">Their median</th><th>Result</th></tr></thead>
      <tbody>${revRows}</tbody>
    </table></div>
    <ul class="plain">
      <li><strong>Flagrant is tracked through the wrong page.</strong> Its Wikipedia signal is Andrew Schulz's page, which dipped below normal when Akaash Singh's exit was confirmed. Akaash Singh's own page rose to ${ak[0].ratio}x normal that week (about ${fmt(ak[0].heatIfTracked, 0)} Heat if tracked), and to ${ak[1].ratio}x in the Jasleen week (about ${fmt(ak[1].heatIfTracked, 0)}). Shows need every host's page, with the strongest one winning.</li>
      <li><strong>Schulz's page spiked the week after the Jasleen episode</strong> (5.6x, Flagrant's biggest week of the year). We found no Schulz news that week, so the cause is open.</li>
      <li><strong>Jon Pardi's reissue barely registered.</strong> A 10th-anniversary edition may simply not draw attention. By the north star, Heat measures attention, so a quiet event scoring quiet is defensible.</li>
      <li><strong>KSI leaving the Sidemen was only 1.3x to 1.4x</strong> on Wikipedia. Creator news like this lives on YouTube and X, which this backtest cannot see. YouTube Heat switches on around Dec 14.</li>
    </ul>
  </section>

  <section>
    <h2>The biggest Heat weeks</h2>
    <p>${counts.hit ?? 0} of the top 25 match a confirmed event, ${counts.likely ?? 0} more are likely explained, ${counts.open ?? 0} are open.</p>
    <div class="scroll"><table>
      <thead><tr><th class="num">#</th><th>Talent</th><th>Week of</th><th class="num">Heat</th><th class="num">vs normal</th><th>Verdict</th><th>What happened</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table></div>
    <p class="meta">"Week of" is the Monday. "vs normal" is that week's Wikipedia views divided by the talent's own 8-week average.</p>
  </section>

  <section>
    <h2>What a season looks like now</h2>
    <div class="chart" id="hist"><p class="cap">Talent-weeks by Heat points scored (Heat v2)</p></div>
    <div class="chart" id="weekly"><p class="cap">Total Heat across all ${r.sample.count} talent, each week</p></div>
  </section>

  <section>
    <h2>Two side effects to decide on</h2>
    <p><strong>Talent with no countable signal now fall far behind.</strong> Under the old formula a missing signal and a normal week both scored 0. Now a normal week is 15 and a missing signal is still 0. In the live league this week, ${LIVE.zeroHeat} of ${LIVE.draftable} draftable talent score 0 Heat: those without a Wikipedia page, until YouTube and Twitch Heat switch on around Dec 14, plus small pages under the noise floor. They are mostly the small talent the game wants people to draft.</p>
    <p><strong>The Day One multiplier now multiplies the 15.</strong> A 3x pick earns about 3 × ${fmt(cur.heatQuantiles.p50, 0)} ≈ ${fmt(3 * cur.heatQuantiles.p50, 0)} Heat in an ordinary week just for being on the roster, against ${fmt(cur.heatQuantiles.p50, 0)} for a 1x pick. Over a 12-week season that is roughly ${fmt(3 * cur.season12.p50, 0)} versus ${fmt(cur.season12.p50, 0)}, before anyone has grown or spiked. Under the old formula the multiplier only multiplied real movement.</p>
  </section>

  <section>
    <h2>Sunday-night timing</h2>
    <p>Wikipedia reports days in UTC and has no hourly numbers for a single page, so the approved hourly fix is not possible. The alternative is to move each Wikipedia day back by one before assigning it to a week. Sunday evening in the US is Monday in UTC, so this puts Sunday-night events in the right week, at the cost of moving Monday daytime views into the previous week.</p>
    <div class="scroll"><table>
      <thead><tr><th>Talent</th><th>Sunday event</th><th class="num">Today: event week</th><th class="num">Today: next week</th><th class="num">Shifted: event week</th><th class="num">Shifted: next week</th></tr></thead>
      <tbody>${shiftRows}</tbody>
    </table></div>
    <p>With the shift, each event's points land in the week it happened. Overall results barely change (see the knob table).</p>
  </section>

  <section>
    <h2>Knobs</h2>
    <div class="scroll"><table>
      <thead><tr><th>Setting</th><th class="num">Weeks at 0</th><th class="num">10-talent roster / week</th><th class="num">Typical season</th><th class="num">Cap hits</th></tr></thead>
      <tbody>${vRows}</tbody>
    </table></div>
  </section>

  <section>
    <h2>Musician size now uses the larger platform</h2>
    <p>Approved and live: a musician's size for the Day One multiplier and size milestones is the larger of YouTube subscribers and Last.fm listeners. Nine musicians moved up a tier, including RICEWINE, blackwinterwells and dad sports (3x to 1.5x). The bottom two bands now hold ${tierAll[0] + tierAll[1]} talent, down from 28, and no musician is in the 3x band.</p>
    <div class="scroll"><table>
      <thead><tr><th>Draftable</th><th class="num">3x</th><th class="num">2x</th><th class="num">1.5x</th><th class="num">1x</th><th class="num">Total</th></tr></thead>
      <tbody>${tierRows}<tr class="current"><td>All</td>${tierAll.map((n) => `<td class="num">${n}</td>`).join('')}<td class="num">${tierAll.reduce((a, b) => a + b, 0)}</td></tr></tbody>
    </table></div>
  </section>

  <section>
    <h2>Decisions for Faraz</h2>
    <div class="decision"><ol>
      <li><strong>Talent with no countable Heat signal:</strong> (a) leave at 0, since most gain YouTube or Twitch Heat by Dec 14, before anyone plays; or (b) give them the normal-week 15 until a signal exists, so small talent are not penalized for missing data.</li>
      <li><strong>Multiplier and the 15:</strong> (a) multiply everything, as now; or (b) leave the 15 unmultiplied and multiply only Growth, Heat above 15, and milestones, so the multiplier rewards small talent who move, not small talent who sit still.</li>
      <li><strong>Sunday-night timing:</strong> hourly is not available. Approve the one-day shift instead?</li>
      <li><strong>Shows with several hosts:</strong> track every host's Wikipedia page (Akaash Singh for Flagrant, Jack Selby for Iced Coffee Hour, Francis Foster for TRIGGERnometry) with the strongest one winning?</li>
    </ol></div>
  </section>

  <p class="meta">Source: Wikimedia Pageviews API (user traffic, English Wikipedia), YouTube Data API and Last.fm for audience sizes. Scored with the production formulas in src/lib/scoring, dry run. Re-run: npm run backtest, then node scripts/backtest/build-report.mjs.</p>
</div>

<script>
const DATA = ${JSON.stringify(data)};
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function tooltip(box) { const t = document.createElement('div'); t.className = 'tip'; t.hidden = true; box.appendChild(t); return t; }
function place(tip, box, x, y, text) { const r = box.getBoundingClientRect(); tip.textContent = text; tip.hidden = false; tip.style.left = Math.min(Math.max(x - r.left, 80), r.width - 80) + 'px'; tip.style.top = (y - r.top) + 'px'; }

function histogram() {
  const box = document.getElementById('hist'); const tip = tooltip(box);
  const W = 640, H = 220, m = { l: 46, r: 8, t: 10, b: 34 };
  const svg = el('svg', { viewBox: \`0 0 \${W} \${H}\`, role: 'img', 'aria-label': 'Histogram of weekly Heat points' }, box);
  const bins = DATA.hist; const max = Math.max(...bins.map(b => b.count));
  const step = [50, 100, 200, 250, 500, 1000, 2000].find(s => max / s <= 5) || 5000;
  const top = Math.ceil(max / step) * step;
  const y = v => m.t + (H - m.t - m.b) * (1 - v / top);
  const g = el('g', { class: 'axis' }, svg);
  for (let v = 0; v <= top; v += step) { el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--grid'), 'stroke-width': 1 }, g); el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toLocaleString(); }
  const bw = (W - m.l - m.r) / bins.length;
  bins.forEach((b, i) => {
    const x = m.l + i * bw; const h = y(0) - y(b.count);
    if (h > 0) el('path', { d: \`M\${x + 3},\${y(0)} v\${-Math.max(h - 4, 0)} q0,-4 4,-4 h\${bw - 14} q4,0 4,4 v\${Math.max(h - 4, 0)} z\`, fill: i === 0 ? css('--muted') : css('--heat'), opacity: i === 0 ? 0.45 : 1 }, svg);
    el('text', { x: x + bw / 2, y: H - m.b + 16, 'text-anchor': 'middle' }, g).textContent = b.label;
    const hit = el('rect', { x, y: m.t, width: bw, height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', e => place(tip, box, e.clientX, e.clientY, \`\${b.label} points: \${b.count.toLocaleString()} talent-weeks\`));
    hit.addEventListener('pointerleave', () => tip.hidden = true);
  });
  el('text', { x: (W + m.l) / 2, y: H - 2, 'text-anchor': 'middle' }, g).textContent = 'Heat points in the week';
}

function weekly() {
  const box = document.getElementById('weekly'); const tip = tooltip(box);
  const W = 640, H = 230, m = { l: 46, r: 12, t: 22, b: 30 };
  const svg = el('svg', { viewBox: \`0 0 \${W} \${H}\`, role: 'img', 'aria-label': 'Weekly total Heat across all talent' }, box);
  const pts = DATA.weekly; const max = Math.max(...pts.map(p => p.total));
  const step = [100, 200, 250, 500].find(s => max / s <= 5) || 1000; const top = Math.ceil(max / step) * step;
  const x = i => m.l + (W - m.l - m.r) * (i / (pts.length - 1)); const y = v => m.t + (H - m.t - m.b) * (1 - v / top);
  const g = el('g', { class: 'axis' }, svg);
  for (let v = 0; v <= top; v += step) { el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--grid'), 'stroke-width': 1 }, g); el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v; }
  pts.forEach((p, i) => { if (p.week.slice(8) <= '07') { const d = new Date(p.week + 'T12:00:00Z'); el('text', { x: x(i), y: H - m.b + 16, 'text-anchor': 'middle' }, g).textContent = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); } });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.total).toFixed(1)).join(' ');
  el('path', { d: line + \` L\${x(pts.length - 1)},\${y(0)} L\${x(0)},\${y(0)} Z\`, fill: css('--heat-soft') }, svg);
  el('path', { d: line, fill: 'none', stroke: css('--heat'), 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  for (const a of DATA.annotations) { const i = pts.findIndex(p => p.week === a.week); if (i < 0) continue; el('circle', { cx: x(i), cy: y(pts[i].total), r: 4, fill: css('--heat'), stroke: css('--surface'), 'stroke-width': 2 }, svg); const t = el('text', { x: x(i) + (i > pts.length - 10 ? -7 : 7), y: y(pts[i].total) - 8, 'font-size': 11, fill: css('--fg'), 'font-family': css('--font-data'), 'text-anchor': i > pts.length - 10 ? 'end' : 'start' }, svg); t.textContent = a.label; }
  const cross = el('line', { y1: m.t, y2: H - m.b, stroke: css('--muted'), 'stroke-width': 1, opacity: 0 }, svg);
  const dot = el('circle', { r: 4, fill: css('--heat'), stroke: css('--surface'), 'stroke-width': 2, opacity: 0 }, svg);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((sx - m.l) / ((W - m.l - m.r) / (pts.length - 1)))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 0.5);
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i].total)); dot.setAttribute('opacity', 1);
    const d = new Date(pts[i].week + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    place(tip, box, e.clientX, r.top + (y(pts[i].total) / H) * r.height, \`Week of \${d}: \${Math.round(pts[i].total)} points, \${pts[i].scorers} talent scoring\`);
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); });
}

function draw() { for (const id of ['hist', 'weekly']) { document.getElementById(id).querySelectorAll('svg, .tip').forEach(n => n.remove()); } histogram(); weekly(); }
draw();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
</script>
`;
writeFileSync('docs/backtest/report.html', html);
console.log('wrote docs/backtest/report.html', html.length, 'bytes');
