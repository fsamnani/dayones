// Builds docs/backtest/report.html from results.json + events.json.
//   node scripts/backtest/build-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('docs/backtest/results.json', 'utf8'));
const events = JSON.parse(readFileSync('docs/backtest/events.json', 'utf8'));
const cur = r.summaries.current;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
const date = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateY = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const counts = events.reduce((a, e) => ((a[e.verdict] = (a[e.verdict] ?? 0) + 1), a), {});
const VERDICT = { hit: 'Matches a real event', likely: 'Likely explained', open: 'No event found' };

const topRows = r.topWeeks
  .map((w, i) => {
    const e = events[i];
    const ev = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.event)}</a>` : esc(e.event);
    return `<tr><td class="num">${i + 1}</td><td>${esc(w.name)}</td><td class="nowrap">${date(w.week)}</td><td class="num">${fmt(w.heat)}</td><td class="num">${w.ratio}x</td><td><span class="chip chip-${e.verdict}">${VERDICT[e.verdict]}</span></td><td class="ev">${ev}</td></tr>`;
  })
  .join('');

const variants = ['current', 'floor50', 'floor200', 'baseline4'];
const vLabel = { current: 'Current: floor 100/day, 8-week baseline', floor50: 'Floor 50/day', floor200: 'Floor 200/day', baseline4: '4-week baseline' };
const vRows = variants
  .map((k) => {
    const s = r.summaries[k];
    return `<tr${k === 'current' ? ' class="current"' : ''}><td>${vLabel[k]}</td><td class="num">${s.zeroWeeksPct}%</td><td class="num">${s.atLeast10Pct}%</td><td class="num">${fmt(s.season12.p50)}</td><td class="num">${fmt(s.season12.p90)}</td><td class="num">${s.neverEligible.length}</td></tr>`;
  })
  .join('');

const mb = r.musicianBalance.rows;
const mbRow = (m) => `<tr><td>${esc(m.name)}</td><td class="num">${fmt(m.youtube)}</td><td class="num">${fmt(m.lastfm)}</td><td class="num">${m.youtubeShare}%</td></tr>`;
const ytHeavy = mb.slice(0, 5).map(mbRow).join('');
const lfHeavy = mb.slice(-6).reverse().map(mbRow).join('');

const data = {
  hist: (() => {
    // Rebuilt from every talent-week so each week lands in exactly one bin.
    const heats = r.perTalent.flatMap((t) => t.series);
    const edges = [5, 10, 15, 20, 30, 40, 50];
    const bins = [{ label: '0', count: heats.filter((h) => h === 0).length }];
    let lo = 0;
    for (const hi of edges) { bins.push({ label: lo === 0 ? 'under 5' : lo + '–' + hi, count: heats.filter((h) => h > 0 && h >= lo && h < hi).length }); lo = hi; }
    bins.push({ label: '50 (cap)', count: heats.filter((h) => h >= 50).length });
    if (bins.reduce((a, b) => a + b.count, 0) !== heats.length) throw new Error('histogram does not add up');
    return bins;
  })(),
  weekly: r.weekly,
  annotations: [
    { week: '2026-02-09', label: 'Super Bowl LX' },
    { week: '2026-04-13', label: 'Coachella' },
    { week: '2026-05-11', label: 'Drake triple album' },
  ],
};

const html = `<title>DayOnes Heat Backtest</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column of findings, wide tables scroll inside their own frame. A scouting report, not a dashboard. */
:root {
  --bg: #f6f6f3; --surface: #ffffff; --fg: #17181c; --muted: #5d6068; --line: #dcdcd6;
  --heat: #d9480f; --heat-soft: #fbe3d6; --grid: #e7e6e1;
  --good: #1f7a3a; --good-bg: #dcf0e2; --warn: #8a5a00; --warn-bg: #fbecc8; --open: #5d6068; --open-bg: #ecebe6;
  --font-display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --font-body: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #131418; --surface: #1b1c21; --fg: #ecebe6; --muted: #a2a4ab; --line: #2e3037;
  --heat: #ff7a3d; --heat-soft: #3a2417; --grid: #26282e;
  --good: #6fd08c; --good-bg: #173322; --warn: #f0c060; --warn-bg: #3a2e12; --open: #a2a4ab; --open-bg: #26282e; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #131418; --surface: #1b1c21; --fg: #ecebe6; --muted: #a2a4ab; --line: #2e3037;
  --heat: #ff7a3d; --heat-soft: #3a2417; --grid: #26282e;
  --good: #6fd08c; --good-bg: #173322; --warn: #f0c060; --warn-bg: #3a2e12; --open: #a2a4ab; --open-bg: #26282e; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--font-body); }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 40px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 44px; }
header { display: grid; gap: 10px }
.eyebrow { font: 500 12px/1 var(--font-data); letter-spacing: .08em; text-transform: uppercase; color: var(--heat) }
h1 { font: 800 clamp(30px, 6vw, 44px)/1.05 var(--font-display); margin: 0; letter-spacing: -.01em; text-wrap: balance }
h2 { font: 700 22px/1.2 var(--font-display); margin: 0 0 6px; text-wrap: balance }
h3 { font: 700 16px/1.3 var(--font-display); margin: 18px 0 6px }
p { margin: 0 0 12px; max-width: 66ch }
.lede { font-size: 17px; color: var(--muted); max-width: 62ch }
.meta { font: 13px/1.5 var(--font-data); color: var(--muted) }
section { display: grid; gap: 8px; min-width: 0 }
.findings { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)) }
.finding { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px; display: grid; gap: 6px; align-content: start }
.finding .k { font: 700 28px/1 var(--font-display); color: var(--heat); font-variant-numeric: tabular-nums }
.finding .t { font-size: 14px; color: var(--muted) }
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
td.nowrap { white-space: nowrap }
td.ev { min-width: 260px; color: var(--muted) }
td.ev a { color: var(--fg) }
tr.current td { background: var(--heat-soft) }
.chip { display: inline-block; font: 500 12px/1.3 var(--font-data); padding: 3px 8px; border-radius: 999px; white-space: nowrap }
.chip::before { margin-right: 4px }
.chip-hit { color: var(--good); background: var(--good-bg) } .chip-hit::before { content: "✓" }
.chip-likely { color: var(--warn); background: var(--warn-bg) } .chip-likely::before { content: "~" }
.chip-open { color: var(--open); background: var(--open-bg) } .chip-open::before { content: "?" }
.decision { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--heat); border-radius: 10px; padding: 16px 18px }
.decision ol { margin: 0; padding-left: 20px; display: grid; gap: 10px }
ul.plain { margin: 0; padding-left: 20px; display: grid; gap: 6px; max-width: 66ch }
a { color: var(--heat) }
a:focus-visible { outline: 2px solid var(--heat); outline-offset: 2px }
.axis text { font: 11px var(--font-data); fill: var(--muted) }
@media (prefers-reduced-motion: reduce) { * { transition: none !important } }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Backtest · PRD 5g · Heat only</div>
    <h1>DayOnes Heat Backtest</h1>
    <p class="lede">The real Heat formula, run week by week over the past year of Wikipedia attention, to see whether it catches real moments and how often it scores at all.</p>
    <div class="meta">${r.sample.count} talent (${r.sample.byPosition.musician} musicians, ${r.sample.byPosition.creator} creators, ${r.sample.byPosition.streamer} streamers) · ${r.weeks.count} weeks, ${dateY(r.weeks.first)} to ${dateY(r.weeks.last)} · ${fmt(cur.talentWeeks)} talent-weeks · run ${dateY(r.today)}</div>
  </header>

  <section>
    <h2>What we learned</h2>
    <div class="findings">
      <div class="finding"><div class="k">${counts.hit} of 25</div><div class="t">biggest Heat weeks match a real event: Grammys, Super Bowl, Coachella, album drops, a World Cup anthem. ${counts.likely} more are likely explained.</div></div>
      <div class="finding"><div class="k">${cur.zeroWeeksPct}%</div><div class="t">of talent-weeks score 0 Heat. Only ${cur.atLeast10Pct}% reach 10 points. Heat is rare and spiky.</div></div>
      <div class="finding"><div class="k">${fmt(cur.season12.p50)}</div><div class="t">Heat points for a typical talent across a 12-week season. The top tenth earn ${fmt(cur.season12.p90)}.</div></div>
      <div class="finding"><div class="k">${cur.capHits}</div><div class="t">weeks hit the 50-point cap. The biggest week of the year, Bad Bunny's Grammys plus Super Bowl run, scored ${fmt(cur.heatQuantiles.max)}.</div></div>
    </div>
  </section>

  <section>
    <h2>Does it catch real moments?</h2>
    <p>Mostly yes. For each of the 25 highest-scoring weeks, we searched the news for what happened. The confirmed hits are exactly the moments a fan would name. The open ones are for Faraz to check: either something happened we missed, or the formula fired on noise.</p>
    <div class="scroll"><table>
      <thead><tr><th class="num">#</th><th>Talent</th><th>Week of</th><th class="num">Heat</th><th class="num">vs normal</th><th>Verdict</th><th>What happened</th></tr></thead>
      <tbody>${topRows}</tbody>
    </table></div>
    <p class="meta">"Week of" is the Monday. "vs normal" is Wikipedia views that week divided by the talent's own 8-week average.</p>
  </section>

  <section>
    <h2>How lumpy is it?</h2>
    <p>Very. Two out of three weeks a talent scores nothing, and most of the rest are small. A 10-talent roster would collect roughly ${fmt(cur.meanHeat * 10)} Heat points in an average week, with the occasional big week from one pick doing most of the work.</p>
    <div class="chart" id="hist"><p class="cap">Talent-weeks by Heat points scored (current settings)</p></div>
    <div class="chart" id="weekly"><p class="cap">Total Heat across all ${r.sample.count} talent, each week</p></div>
  </section>

  <section>
    <h2>Do the tuning knobs matter?</h2>
    <p>Barely. Halving or doubling the Wikipedia noise floor, or shortening the baseline to 4 weeks, moves the results by about a point. The floor only decides which small pages count at all.</p>
    <div class="scroll"><table>
      <thead><tr><th>Setting</th><th class="num">Weeks at 0</th><th class="num">Weeks ≥ 10</th><th class="num">Typical season</th><th class="num">Top-tenth season</th><th class="num">Never eligible</th></tr></thead>
      <tbody>${vRows}</tbody>
    </table></div>
    <p>Under the current floor of 100 views a day, ${cur.neverEligible.length} talent never get Wikipedia Heat: ${cur.neverEligible.map(esc).join(', ')}. Their pages are too small. ${cur.mostlyBelowFloor.length} are below the floor most weeks: ${cur.mostlyBelowFloor.map(esc).join(', ')}. Small talent will depend on YouTube and Twitch Heat, which switches on around Dec 14.</p>
  </section>

  <section>
    <h2>Musician audience: YouTube vs Last.fm</h2>
    <p>The PRD expected YouTube to dominate every musician's Audience Index. It does for global stars, but the reverse holds for small indie and underground artists, whose listeners are on Last.fm. The median musician is ${r.musicianBalance.medianYoutubeShare}% YouTube.</p>
    <div class="scroll"><table>
      <thead><tr><th>Mostly YouTube</th><th class="num">YouTube subs</th><th class="num">Last.fm listeners</th><th class="num">YouTube share</th></tr></thead>
      <tbody>${ytHeavy}</tbody>
      <thead><tr><th>Mostly Last.fm</th><th class="num">YouTube subs</th><th class="num">Last.fm listeners</th><th class="num">YouTube share</th></tr></thead>
      <tbody>${lfHeavy}</tbody>
    </table></div>
    <p>This matters for the Day One multiplier, which is set from YouTube subscribers for musicians. RICEWINE has 5,330 subscribers (3x tier) but 347,000 Last.fm listeners, which would be the 1.5x tier. See decision 2.</p>
  </section>

  <section>
    <h2>Other findings</h2>
    <ul class="plain">
      <li><strong>Sunday-night events land a week late.</strong> Wikipedia counts days in UTC, so the Grammys, Super Bowl and Coachella, all Sunday evening in the US, show up on Monday and score in the following week. Fixable by reading Wikipedia's hourly numbers and assigning them to Pacific days.</li>
      <li><strong>Attention can build before the moment.</strong> Loe Shimmy was already at 2.25x normal the week before his viral drop. Scouts who watch Heat can act early, which is the behavior the game should reward.</li>
      <li><strong>Global stars dominate the year's total.</strong> Karol G, Bad Bunny and Burna Boy top the year. Heat is relative to each talent's own normal, so this is a real signal of eventful years, not a size bias, but the Day One multiplier is what keeps small finds competitive.</li>
    </ul>
  </section>

  <section>
    <h2>Not answered yet</h2>
    <ul class="plain">
      <li><strong>Which signal wins most often.</strong> Before Nov 15 only Wikipedia exists, so it wins every time. Re-run once YouTube and Twitch Heat switch on, around Dec 14.</li>
      <li><strong>Do Heat and Growth double-count the same rise.</strong> Growth history starts this week. Re-run with six weeks of Growth, around early January.</li>
      <li><strong>Heat vs Growth size.</strong> Whether a typical season's ${fmt(cur.season12.p50)} Heat points is too small next to Growth can only be judged once Growth exists.</li>
    </ul>
  </section>

  <section>
    <h2>Decisions for Faraz</h2>
    <div class="decision"><ol>
      <li><strong>Check the ${counts.open} open weeks</strong> in the table. Confirmed ones go into the scoring review log as hits; any that were noise go in as misses.</li>
      <li><strong>Musician size at draft:</strong> keep YouTube subscribers, or use the larger of YouTube subscribers and Last.fm listeners. The second matches the "biggest platform" rule but moves several new 3x and 2x musicians up to 1.5x.</li>
      <li><strong>Heat settings:</strong> leave them as they are until YouTube and Twitch Heat switch on, since the knobs barely move the results today.</li>
      <li><strong>Sunday-night timing fix:</strong> approve switching Wikipedia to hourly data so weekend events score in the right week.</li>
    </ol></div>
  </section>

  <p class="meta">Source: Wikimedia Pageviews API (user traffic, English Wikipedia), YouTube Data API and Last.fm for audience sizes. Scored with the production formulas in src/lib/scoring, dry run. Re-run: npm run backtest.</p>
</div>

<script>
const DATA = ${JSON.stringify(data)};
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function tooltip(box) { const t = document.createElement('div'); t.className = 'tip'; t.hidden = true; box.appendChild(t); return t; }
function place(tip, box, x, y, text) { const r = box.getBoundingClientRect(); tip.textContent = text; tip.hidden = false; tip.style.left = Math.min(Math.max(x - r.left, 70), r.width - 70) + 'px'; tip.style.top = (y - r.top) + 'px'; }

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
    const label = b.label;
    el('path', { d: \`M\${x + 3},\${y(0)} v\${-Math.max(h - 4, 0)} q0,-4 4,-4 h\${bw - 14} q4,0 4,4 v\${Math.max(h - 4, 0)} z\`, fill: i === 0 ? css('--muted') : css('--heat'), opacity: i === 0 ? 0.45 : 1 }, svg);
    el('text', { x: x + bw / 2, y: H - m.b + 16, 'text-anchor': 'middle' }, g).textContent = label;
    const hit = el('rect', { x, y: m.t, width: bw, height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', e => place(tip, box, e.clientX, e.clientY, \`\${label} points: \${b.count.toLocaleString()} talent-weeks\`));
    hit.addEventListener('pointerleave', () => tip.hidden = true);
  });
  el('text', { x: (W + m.l) / 2, y: H - 2, 'text-anchor': 'middle' }, g).textContent = 'Heat points in the week';
}

function weekly() {
  const box = document.getElementById('weekly'); const tip = tooltip(box);
  const W = 640, H = 220, m = { l: 46, r: 12, t: 22, b: 30 };
  const svg = el('svg', { viewBox: \`0 0 \${W} \${H}\`, role: 'img', 'aria-label': 'Weekly total Heat across all talent' }, box);
  const pts = DATA.weekly; const max = Math.max(...pts.map(p => p.total)); const top = Math.ceil(max / 50) * 50;
  const x = i => m.l + (W - m.l - m.r) * (i / (pts.length - 1)); const y = v => m.t + (H - m.t - m.b) * (1 - v / top);
  const g = el('g', { class: 'axis' }, svg);
  for (let v = 0; v <= top; v += 50) { el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: css('--grid'), 'stroke-width': 1 }, g); el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v; }
  pts.forEach((p, i) => { if (p.week.slice(8) <= '07' ) { const d = new Date(p.week + 'T12:00:00Z'); el('text', { x: x(i), y: H - m.b + 16, 'text-anchor': 'middle' }, g).textContent = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); } });
  const line = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.total).toFixed(1)).join(' ');
  el('path', { d: line + \` L\${x(pts.length - 1)},\${y(0)} L\${x(0)},\${y(0)} Z\`, fill: css('--heat-soft') }, svg);
  el('path', { d: line, fill: 'none', stroke: css('--heat'), 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
  for (const a of DATA.annotations) { const i = pts.findIndex(p => p.week === a.week); if (i < 0) continue; el('circle', { cx: x(i), cy: y(pts[i].total), r: 4, fill: css('--heat'), stroke: css('--surface'), 'stroke-width': 2 }, svg); el('text', { x: x(i) + 7, y: y(pts[i].total) - 6, class: '' , 'font-size': 11, fill: css('--fg'), 'font-family': css('--font-data') }, svg).textContent = a.label; }
  const cross = el('line', { y1: m.t, y2: H - m.b, stroke: css('--muted'), 'stroke-width': 1, opacity: 0 }, svg);
  const dot = el('circle', { r: 4, fill: css('--heat'), stroke: css('--surface'), 'stroke-width': 2, opacity: 0 }, svg);
  const hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(); const sx = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((sx - m.l) / ((W - m.l - m.r) / (pts.length - 1)))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 0.5);
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(pts[i].total)); dot.setAttribute('opacity', 1);
    const d = new Date(pts[i].week + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    place(tip, box, e.clientX, r.top + (y(pts[i].total) / H) * r.height, \`Week of \${d}: \${pts[i].total} points, \${pts[i].scorers} talent scoring\`);
  });
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); });
}

function draw() { for (const id of ['hist', 'weekly']) { const b = document.getElementById(id); b.querySelectorAll('svg, .tip').forEach(n => n.remove()); } histogram(); weekly(); }
draw();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
</script>
`;
writeFileSync('docs/backtest/report.html', html);
console.log('wrote docs/backtest/report.html', html.length, 'bytes');
