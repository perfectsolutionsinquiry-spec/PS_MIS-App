/* ================= shared chart renderers ================= */
function renderKpis(){
  const k = DATA.kpis;
  const tiles = [
    {label:'Total agreement value', value: fmtCompact(k.total_agreement), sub: k.units + ' units', good:false},
    {label:'Total received', value: fmtCompact(k.total_received), sub: k.collection_pct + '% of agreement value', good:true},
    {label:'Balance outstanding', value: fmtCompact(k.total_balance), sub: k.balance_pct_of_due.toFixed(1) + '% of amount due'
        + (k.total_advance > 0 ? ' · ' + fmtCompact(k.total_advance) + ' paid ahead' : ''), good:false},
    {label:'Loan amount sanctioned', value: fmtCompact(k.total_loan), sub: 'across ' + k.bankFiles + ' loan case' + (k.bankFiles === 1 ? '' : 's'), good:false},
    {label:'Collection efficiency', value: k.due_collection_pct + '%', sub: 'received vs. amount due', good:true},
    {label:'Units tracked', value: k.units, sub: 'in the current view', good:false},
  ];
  const KPI_REPORT = ['agreement','received','balance','loan','efficiency','units'];
  document.getElementById('kpi-row').innerHTML = tiles.map((t, i) => `
    <div class="stat-tile rdrill" data-report="${KPI_REPORT[i]}"><div class="label">${t.label}</div>
    <div class="value">${t.value}</div>
    <div class="sub ${t.good?'good':''}">${t.sub}</div></div>`).join('');
}

function polarToXY(cx, cy, r, angleDeg){ const a = (angleDeg - 90) * Math.PI / 180; return [cx + r*Math.cos(a), cy + r*Math.sin(a)]; }
function arcPath(cx, cy, rOuter, rInner, startAngle, endAngle){
  const [x1,y1] = polarToXY(cx, cy, rOuter, startAngle), [x2,y2] = polarToXY(cx, cy, rOuter, endAngle);
  const [x3,y3] = polarToXY(cx, cy, rInner, endAngle), [x4,y4] = polarToXY(cx, cy, rInner, startAngle);
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

const STATUS_COLOR = {'SANCTIONED':'--series-1','PARTLY DISBURSED':'--series-2','FULLY DISBURSED':'--series-3','NOT STARTED':'--series-4'};
const STATUS_LABEL = {'SANCTIONED':'Sanctioned','PARTLY DISBURSED':'Partly disbursed','FULLY DISBURSED':'Fully disbursed','NOT STARTED':'Not started'};

function renderDonut(){
  const data = DATA.status_dist;
  // maximized, the donut should fill the space it has been given rather than staying a
  // 260px thumbnail in the middle of a full-screen page
  const host = document.getElementById('donut-status-chart');
  const inMax = !!(host && host.closest('.max-host'));
  // leave room for the legend and the table toggle beneath it
  const avail = inMax ? Math.min((host.clientWidth || 900) - 40, window.innerHeight - 300) : 260;
  const DONUT_PX = inMax ? Math.max(260, Math.min(560, avail)) : 260;
  const total = data.reduce((s,d) => s + d.value, 0);
  const safeTotal = total || 1; // avoid divide-by-zero in arc angles when no loans are sanctioned yet; display uses the real total
  const cx = 130, cy = 130, rOuter = 108, rInner = 66;
  const gapDeg = data.length > 1 ? 2.2 : 0;
  let angle = 0, paths = '';
  const legendItems = [];
  data.forEach((d, i) => {
    const sweep = (d.value/safeTotal) * 360;
    const start = angle + gapDeg/2, end = angle + sweep - gapDeg/2;
    const colorVar = STATUS_COLOR[d.status] || CATS[(i+4) % 8];
    const pct = ((d.value/safeTotal)*100).toFixed(1);
    const label = STATUS_LABEL[d.status] || titleCase(d.status);
    // a single slice covering the full circle degenerates as an arc path (start point == end
    // point, so nothing is drawn) -- render it as a stroked ring instead
    const isFull = sweep >= 359.99;
    paths += isFull
      ? `<circle cx="${cx}" cy="${cy}" r="${(rOuter+rInner)/2}" fill="none" stroke="var(${colorVar})"
        stroke-width="${rOuter-rInner}" data-report="status" data-param="${esc(d.status)}" data-tip="<b>${label}</b>${d.count} unit${d.count>1?'s':''} · ${fmtINR(d.value)} · ${pct}% <i>,  click for records</i>" style="cursor:pointer" class="donut-seg"/>`
      : `<path d="${arcPath(cx,cy,rOuter,rInner,start,end)}" fill="var(${colorVar})"
        data-report="status" data-param="${esc(d.status)}" data-tip="<b>${label}</b>${d.count} unit${d.count>1?'s':''} · ${fmtINR(d.value)} · ${pct}% <i>,  click for records</i>" style="cursor:pointer" class="donut-seg"/>`;
    legendItems.push({label, value:d.value, count:d.count, colorVar, pct, status:d.status});
    angle += sweep;
  });
  document.getElementById('donut-status-chart').innerHTML = `
  <svg viewBox="0 0 260 260" width="${DONUT_PX}" height="${DONUT_PX}"
       style="margin:0 auto;display:block;width:${DONUT_PX}px;height:${DONUT_PX}px;max-width:100%;">
    ${paths}
    <text x="${cx}" y="${cy-4}" text-anchor="middle" class="donut-center-value">${fmtCompact(total)}</text>
    <text x="${cx}" y="${cy+16}" text-anchor="middle" class="donut-center-label">Total loan value</text>
  </svg>`;
  document.getElementById('donut-status-legend').innerHTML = legendItems.map(li => `
    <div class="item" data-report="status" data-param="${esc(li.status)}" style="cursor:pointer"><span class="swatch" style="background:var(${li.colorVar})"></span>${li.label} &middot; ${li.count} · ${li.pct}%</div>`).join('');
  document.querySelectorAll('.donut-seg').forEach(el => {
    el.addEventListener('mousemove', e => showTip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', hideTip);
  });
  document.getElementById('donut-status-table').innerHTML =
    `<thead><tr><th>Status</th><th class="num">Units</th><th class="num">Loan value</th><th class="num">Share</th></tr></thead>
    <tbody>${legendItems.map(li => `<tr><td>${li.label}</td><td class="num">${li.count}</td><td class="num">${fmtINR(li.value)}</td><td class="num">${li.pct}%</td></tr>`).join('')}</tbody>`;
}

function niceStep(maxVal){
  const raw = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  let niceNorm = 1;
  if (norm > 5) niceNorm = 10; else if (norm > 2.5) niceNorm = 5; else if (norm > 1) niceNorm = 2;
  return niceNorm * mag;
}

function renderHBar(containerId, tableId, items, labelKey, valueKey, colorVar, labelHeader, colorFn, reportKind, scrollY){
  const realMax = items.length ? Math.max(...items.map(d => d[valueKey])) : 0;
  if (realMax <= 0) {
    document.getElementById(containerId).innerHTML = '<div class="axis-label">No amounts recorded yet.</div>';
    if (tableId) document.getElementById(tableId).innerHTML = '';
    return;
  }
  const w = 560, leftPad = 168, rightPad = 54, topPad = 6, rowH = 34, barH = 18;
  const h = topPad + items.length * rowH + 10;
  const maxVal = Math.max(...items.map(d => d[valueKey]), 1);
  const scale = (w - leftPad - rightPad) / (maxVal || 1);
  let gridlines = '';
  const step = niceStep(maxVal);
  for (let v = 0; v <= maxVal + step*0.001; v += step) {
    const x = leftPad + v*scale;
    gridlines += `<line x1="${x}" y1="${topPad-2}" x2="${x}" y2="${h-8}" class="grid-line"/>
      <text x="${x}" y="${h}" class="axis-label" text-anchor="middle">${fmtCompact(v)}</text>`;
  }
  let bars = '';
  items.forEach((d, i) => {
    const y = topPad + i*rowH + (rowH-barH)/2;
    const bw = d[valueKey]*scale;
    const label = d[labelKey];
    const cvar = colorFn ? colorFn(d) : colorVar;
    bars += `
      <text x="${leftPad-10}" y="${y+barH/2+4}" text-anchor="end" class="cat-label">${label}</text>
      <path d="M ${leftPad} ${y} H ${leftPad+Math.max(bw-4,0)} Q ${leftPad+bw} ${y} ${leftPad+bw} ${y+4}
               V ${y+barH-4} Q ${leftPad+bw} ${y+barH} ${leftPad+Math.max(bw-4,0)} ${y+barH} H ${leftPad} Z"
            fill="${cvar}" class="hbar-seg" data-tip="<b>${label}</b>${fmtINR(d[valueKey])}"/>
      <text x="${leftPad+bw+8}" y="${y+barH/2+4}" class="bar-value">${fmtCompact(d[valueKey])}</text>
      ${reportKind ? `<rect x="0" y="${y-(rowH-barH)/2}" width="${w}" height="${rowH}" fill="var(--brand-primary)" opacity="0"
            class="hbar-hit" data-report="${reportKind}" data-param="${String(label).replace(/"/g,'&quot;')}"/>` : ''}`;
  });
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMinYMin meet">
    ${gridlines}<line x1="${leftPad}" y1="${topPad-2}" x2="${leftPad}" y2="${h-8}" class="baseline"/>${bars}</svg>`;
  document.getElementById(containerId).innerHTML = scrollY
    ? `<div class="chart-scroll-y">${svg}</div>` : svg;
  document.querySelectorAll(`#${containerId} .hbar-seg`).forEach(el => {
    el.addEventListener('mousemove', e => showTip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', hideTip);
  });
  if (tableId) {
    document.getElementById(tableId).innerHTML = `<thead><tr><th>${labelHeader}</th><th class="num">Amount</th></tr></thead>
      <tbody>${items.map(d => `<tr><td>${d[labelKey]}</td><td class="num">${fmtINR(d[valueKey])}</td></tr>`).join('')}</tbody>`;
  }
}

/* ---------------- Daily collection ----------------
   Three things went wrong with the old version and all three come from the same root:
   every single day with a receipt got its own bar, so on a real file the chart ran to
   ~4000px inside a 570px card. The y-axis scrolled out of sight, the date labels ran
   into each other, and the whole thing was unreadable. So: a range picker, and buckets
   that widen automatically (day -> week -> month) once a range gets long. The y-axis is
   drawn in its own SVG that sits OUTSIDE the scroller, so it is always on screen.        */
const MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAILY_RANGES = [
  { k: '7d',   l: 'Last 7 days',      days: 7 },
  { k: '14d',  l: 'Last 2 weeks',     days: 14 },
  { k: '1m',   l: 'Last month',       days: 31 },
  { k: '3m',   l: 'Last 3 months',    days: 92 },
  { k: '6m',   l: 'Last 6 months',    days: 183 },
  { k: '1y',   l: 'Last year',        days: 365 },
  { k: '15m',  l: 'Last year + 3 months',  days: 456 },
  { k: '18m',  l: 'Last year + 6 months',  days: 548 },
  { k: '2y',   l: 'Last 2 years',     days: 730 },
  { k: 'all',  l: 'Everything',       days: 0 },
];
let DAILY_RANGE = '3m';
let DAILY_GRAIN = 'auto';

function dailyRangeDef() { return DAILY_RANGES.find(r => r.k === DAILY_RANGE) || DAILY_RANGES[3]; }

// the newest receipt anchors the window -- "last 3 months" on a file whose data stops in
// June has to mean the three months up to June, not three months up to today, or a file
// you open in December shows an empty chart.
function dailyAnchor(items) {
  let max = null;
  items.forEach(d => { if (!max || d.iso > max) max = d.iso; });
  const today = new Date().toISOString().slice(0, 10);
  return (max && max > today) ? max : (today > (max || '') ? today : max);
}

function dailyBuckets() {
  const all = (DATA.daily || []).filter(d => d.iso);
  if (!all.length) return { rows: [], grain: 'day', note: '' };
  const def = dailyRangeDef();
  let rows = all;
  if (def.days) {
    const anchor = new Date(dailyAnchor(all) + 'T00:00:00');
    const from = new Date(anchor.getTime() - (def.days - 1) * 86400000).toISOString().slice(0, 10);
    rows = all.filter(d => d.iso >= from);
  }
  const spanDays = def.days || (rows.length
    ? Math.round((new Date(rows[rows.length-1].iso) - new Date(rows[0].iso)) / 86400000) + 1 : 1);
  let grain = DAILY_GRAIN;
  if (grain === 'auto') grain = spanDays <= 45 ? 'day' : (spanDays <= 200 ? 'week' : 'month');
  if (grain === 'day') return { rows, grain, note: '' };

  const map = {}, order = [];
  rows.forEach(d => {
    const dt = new Date(d.iso + 'T00:00:00');
    let key, label;
    if (grain === 'week') {
      const wd = (dt.getDay() + 6) % 7;                 // Monday-start week
      const mon = new Date(dt.getTime() - wd * 86400000);
      key = mon.toISOString().slice(0, 10);
      label = MON3[mon.getMonth()] + ' ' + mon.getDate();
    } else {
      key = d.iso.slice(0, 7);
      label = MON3[dt.getMonth()] + " '" + String(dt.getFullYear()).slice(2);
    }
    if (!map[key]) { map[key] = { iso: key, day: label, flat_cost: 0, gst: 0, total: 0 }; order.push(key); }
    map[key].flat_cost += d.flat_cost; map[key].gst += d.gst; map[key].total += d.total;
  });
  order.sort();
  return { rows: order.map(k => map[k]), grain,
           note: grain === 'week' ? 'grouped by week (week starting)' : 'grouped by month' };
}

function renderDailyColumns(){
  const host = document.getElementById('daily-col-chart');
  const tbl  = document.getElementById('daily-col-table');
  const sel  = document.getElementById('daily-range');
  if (sel && sel.options.length !== DAILY_RANGES.length) {
    sel.innerHTML = DAILY_RANGES.map(r => `<option value="${r.k}">${r.l}</option>`).join('');
  }
  if (sel) sel.value = DAILY_RANGE;

  const { rows: items, grain, note } = dailyBuckets();
  const sub = document.getElementById('daily-col-sub');
  if (sub) sub.textContent = 'Money received, day by day' + (note ? ' \u00b7 ' + note : '');

  if (!items.length || Math.max(...items.map(d => d.total)) <= 0) {
    host.innerHTML = '<div class="axis-label">No collection entries in this window: widen the range above.</div>';
    tbl.innerHTML = '';
    return;
  }

  // a -45 degree tick label hangs to the LEFT of its bar; the leftmost one would fall off
  // the plot's own x=0 edge and lose its first characters, so the viewBox starts negative.
  const AXIS_W = 62, topPad = 16, bottomPad = 62, rightPad = 16, LOVER = 38;
  // wider slots when there are few bars, so 7 days does not draw seven hairlines
  const MIN_COL = items.length <= 8 ? 78 : (items.length <= 16 ? 54 : (items.length <= 40 ? 34 : 26));
  const host_w  = Math.max(260, (host.clientWidth || 560) - AXIS_W - LOVER - 8);
  const plotW   = Math.max(host_w, items.length * MIN_COL + rightPad);
  // maximized, the chart gets the height it was never allowed on the dashboard grid
  const inMax = !!host.closest('.max-host');
  const h = inMax ? Math.max(340, Math.min(720, window.innerHeight - 320)) : 286;
  const plotH = h - topPad - bottomPad;
  const maxVal = Math.max(...items.map(d => d.total), 1);
  const step = niceStep(maxVal);
  const niceMax = Math.ceil(maxVal/step)*step || step;
  const yScale = plotH / niceMax;
  const colW = (plotW - rightPad) / items.length;
  const barW = Math.min(34, Math.max(6, colW*0.6));

  // --- axis SVG: its own element, parked outside the scroller so it never scrolls away ---
  let axis = '';
  for (let v = 0; v <= niceMax + step*0.001; v += step) {
    const y = topPad + plotH - v*yScale;
    axis += `<text x="${AXIS_W-9}" y="${y+4}" text-anchor="end" class="axis-label">${fmtCompact(v)}</text>`;
  }
  axis += `<line x1="${AXIS_W-1}" y1="${topPad}" x2="${AXIS_W-1}" y2="${topPad+plotH}" class="baseline"/>`;

  let gridlines = '';
  for (let v = 0; v <= niceMax + step*0.001; v += step) {
    const y = topPad + plotH - v*yScale;
    gridlines += `<line x1="0" y1="${y}" x2="${plotW-rightPad}" y2="${y}" class="grid-line"/>`;
  }
  let maxIdx = 0;
  items.forEach((d,i) => { if (d.total > items[maxIdx].total) maxIdx = i; });
  // never print more tick labels than will fit without colliding
  const every = Math.max(1, Math.ceil(items.length / Math.floor((plotW-rightPad) / 46)));
  let bars = '';
  items.forEach((d, i) => {
    const cx = i*colW + colW/2;
    const bh = d.total*yScale;
    const y = topPad + plotH - bh;
    const x0 = cx - barW/2;
    const r = Math.min(4, barW/2);
    bars += `
      <path d="M ${x0} ${topPad+plotH} V ${y+r} Q ${x0} ${y} ${x0+r} ${y} H ${x0+barW-r} Q ${x0+barW} ${y} ${x0+barW} ${y+r} V ${topPad+plotH} Z"
        fill="var(--series-1)" class="col-seg" opacity="${d.total===0?0.12:1}"/>
      <!-- the hit area sits ON TOP of the bar and carries both the tooltip and the drill-through,
           so hovering or clicking anywhere in the column works, bar or gap alike -->
      <rect x="${i*colW}" y="${topPad}" width="${colW}" height="${plotH}" fill="var(--brand-primary)" opacity="0"
            class="col-hit" data-report="day" data-param="${grain}:${d.iso}"
            data-tip="<b>${d.day}</b>Flat cost: ${fmtINR(d.flat_cost)}<br>GST: ${fmtINR(d.gst)}<br>Total: ${fmtINR(d.total)}"/>
      ${i%every===0 ? `<text x="${cx}" y="${topPad+plotH+14}" text-anchor="end" class="axis-label"
          transform="rotate(-45 ${cx} ${topPad+plotH+14})">${d.day}</text>` : ''}
      ${i===maxIdx && d.total>0 ? `<text x="${cx}" y="${y-6}" text-anchor="middle" class="bar-value">${fmtCompact(d.total)}</text>` : ''}`;
  });

  host.innerHTML =
    `<div class="chart-fixed-axis">
       <svg class="axis-svg" width="${AXIS_W}" height="${h}" viewBox="0 0 ${AXIS_W} ${h}">${axis}</svg>
       <div class="chart-scroll-x"><svg viewBox="${-LOVER} 0 ${plotW+LOVER} ${h}" width="${plotW+LOVER}" height="${h}">
         ${gridlines}<line x1="0" y1="${topPad+plotH}" x2="${plotW-rightPad}" y2="${topPad+plotH}" class="baseline"/>${bars}</svg></div>
     </div>`;
  host.querySelectorAll('.col-hit').forEach(el => {
    el.addEventListener('mousemove', e => showTip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', hideTip);
  });
  const unit = grain === 'day' ? 'Date' : (grain === 'week' ? 'Week starting' : 'Month');
  tbl.innerHTML =
    `<thead><tr><th>${unit}</th><th class="num">Flat cost</th><th class="num">GST</th><th class="num">Total</th></tr></thead>
    <tbody>${items.map(d => `<tr><td>${d.day}</td><td class="num">${fmtINR(d.flat_cost)}</td><td class="num">${fmtINR(d.gst)}</td><td class="num">${fmtINR(d.total)}</td></tr>`).join('')}
    <tr class="tot-row"><td><b>Total</b></td><td class="num"><b>${fmtINR(items.reduce((a,d)=>a+d.flat_cost,0))}</b></td><td class="num"><b>${fmtINR(items.reduce((a,d)=>a+d.gst,0))}</b></td><td class="num"><b>${fmtINR(items.reduce((a,d)=>a+d.total,0))}</b></td></tr></tbody>`;
}

function setDailyRange(k) { DAILY_RANGE = k; renderDailyColumns(); }

/* generic "invoiced (track) vs collected (fill)" meter list */
function renderMeterList(containerId, items, labelKey, invoicedKey, collectedKey, reportKind, scrollY){
  const maxVal = Math.max(...items.map(d => d[invoicedKey]), 1);
  const inner = items.map(d => {
    const invPct = (d[invoicedKey]/maxVal*100).toFixed(2);
    const colPct = (d[collectedKey]/maxVal*100).toFixed(2);
    const pctOfInvoiced = d[invoicedKey] ? Math.round(d[collectedKey]/d[invoicedKey]*100) : 0;
    return `<div class="meter-row${reportKind ? ' clickable' : ''}"${reportKind ? ` data-report="${reportKind}" data-param="${String(d[labelKey]).replace(/"/g,'&quot;')}"` : ''}>
      <div class="m-label">${d[labelKey]}</div>
      <div class="m-track" data-tip="<b>${d[labelKey]}</b>Invoiced: ${fmtINR(d[invoicedKey])}<br>Collected: ${fmtINR(d[collectedKey])} (${pctOfInvoiced}%)">
        <div class="m-invoiced" style="width:${invPct}%"></div>
        <div class="m-collected" style="width:${colPct}%"></div>
      </div>
      <div class="m-val"><b>${fmtCompact(d[collectedKey])}</b> / ${fmtCompact(d[invoicedKey])}<span class="m-pct">${pctOfInvoiced}%</span></div>
    </div>`;
  }).join('');
  document.getElementById(containerId).innerHTML = scrollY ? `<div class="chart-scroll-y">${inner}</div>` : inner;
  document.querySelectorAll(`#${containerId} .m-track`).forEach(el => {
    el.addEventListener('mousemove', e => showTip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', hideTip);
  });
}

function renderMilestoneMeter(){
  const tl = DATA.payment_timeline || [];
  if (!tl.length) { document.getElementById('milestone-meter').innerHTML = '<div class="axis-label">No demand schedule to measure against yet.</div>'; return; }
  const order = [];
  const map = {};
  tl.forEach(t => {
    if (!map[t.milestone]) { map[t.milestone] = {invoiced:0, collected:0}; order.push(t.milestone); }
    if (t.status !== 'Not Yet Due') map[t.milestone].invoiced += t.amount;
    if (t.status === 'Paid') map[t.milestone].collected += t.amount;
    else if (t.status === 'Partially Paid') map[t.milestone].collected += (t.amount_paid || 0);
  });
  const items = order.map(m => ({milestone:m, invoiced:map[m].invoiced, collected:map[m].collected}))
    .filter(d => d.invoiced > 0);
  renderMeterList('milestone-meter', items, 'milestone', 'invoiced', 'collected', 'milestone', true);
}

function renderWingMeter(){
  const map = {};
  DATA.customers.forEach(c => {
    const w = 'Tower ' + (c.tower || c.wing || '–');
    if (!map[w]) map[w] = {invoiced:0, collected:0};
    map[w].invoiced += c.agreement_value;
    map[w].collected += c.received;
  });
  const items = Object.keys(map).sort().map(w => ({wing:w, invoiced:map[w].invoiced, collected:map[w].collected}));
  if (!items.length) { document.getElementById('wing-meter').innerHTML = '<div class="axis-label">No units in the current selection.</div>'; return; }
  renderMeterList('wing-meter', items, 'wing', 'invoiced', 'collected', 'tower', true);
}

function renderGst(){
  const due = DATA.customers.reduce((s,c)=>s+c.gst_due,0);
  const recd = DATA.customers.reduce((s,c)=>s+c.gst_received,0);
  const bal = DATA.customers.reduce((s,c)=>s+c.gst_balance,0);
  document.getElementById('gst-kpis').innerHTML = [
    {l:'GST liability', v: fmtCompact(due), r:'gstDue'}, {l:'GST received', v: fmtCompact(recd), r:'gstRecd'},
    {l:'GST balance', v: fmtCompact(bal), r:'gstBal'},
  ].map(t => `<div class="stat-tile rdrill" data-report="${t.r}"><div class="label">${t.l}</div><div class="value sm">${t.v}</div></div>`).join('');
  renderMeterList('gst-meter', [{label:'All units', invoiced:due, collected:recd}], 'label', 'invoiced', 'collected');
}

function renderOcr(){
  const rows = ocrReportRows();          // same rows the drawers list, so the card reconciles
  const amt = rows.reduce((s,r)=>s+r.ownReq,0);
  const paid = rows.reduce((s,r)=>s+r.ownPaid,0);
  const bal = rows.reduce((s,r)=>s+r.ownPending,0);
  document.getElementById('ocr-kpis').innerHTML = [
    {l:'Own contribution required', v: fmtCompact(amt), r:'ocrReq'},
    {l:'Received', v: fmtCompact(paid), r:'ocrPaid'},
    {l:'Still to arrange', v: fmtCompact(bal), r:'ocrPending'},
  ].map(t => `<div class="stat-tile rdrill" data-report="${t.r}"><div class="label">${t.l}</div><div class="value sm">${t.v}</div></div>`).join('');
  renderMeterList('ocr-meter', [{label:'All units', invoiced:amt, collected:paid}], 'label', 'invoiced', 'collected');
}

function renderAgeing(){
  const tl = DATA.payment_timeline || [];
  const now = new Date();
  const allPending = tl.filter(t => t.status === 'Due, pending' && t.due_date)
    .map(t => ({name: t.customer, days: daysOverdue(t.due_date), milestone: t.milestone}))
    .sort((a,b) => b.days - a.days);
  if (!allPending.length) {
    document.getElementById('ageing-bar-chart').innerHTML = '<div class="axis-label">No overdue demands in this view.</div>';
    document.getElementById('ageing-bar-table').innerHTML = '';
    return;
  }
  // chart: one bar per customer -- their single oldest (most overdue) pending milestone.
  // a customer can be backlogged across several stages at once; the full breakdown is in "View as table".
  const seen = new Set();
  const rows = [];
  allPending.forEach(r => { if (!seen.has(r.name)) { seen.add(r.name); rows.push(r); } });
  const colorFn = (d) => d.days > 45 ? 'var(--status-critical)' : (d.days > 15 ? 'var(--status-warn)' : 'var(--status-good)');
  if (!rows.some(r => r.days > 0)) {
    // everything is due today -- a real state, not "no data". renderHBar bails at max 0.
    document.getElementById('ageing-bar-chart').innerHTML =
      `<div class="axis-label">${rows.length} demand${rows.length===1?' is':'s are'} due today: none overdue yet.</div>`;
  } else {
    renderHBar('ageing-bar-chart', 'ageing-bar-table', rows, 'name', 'days', null, 'Customer', colorFn, 'ageing', true);
    document.querySelectorAll('#ageing-bar-chart .bar-value').forEach((el, i) => { el.textContent = rows[i].days + 'd'; });
  }
  document.getElementById('ageing-bar-table').innerHTML =
    `<thead><tr><th>Customer</th><th>Pending milestone</th><th class="num">Days overdue</th></tr></thead>
    <tbody>${allPending.map(r => `<tr><td>${r.name}</td><td>${r.milestone}</td><td class="num">${r.days}</td></tr>`).join('')}</tbody>`;
}

/* ================= reliability rating engine ================= */
function dashComputeRating(name){
  const rows = (DATA.payment_timeline || []).filter(t => t.customer === name);
  // full and partial payments both count toward the delay average -- money moving late is late either way.
  const paid = rows.filter(t => (t.status === 'Paid' || t.status === 'Partially Paid') && t.delay !== null && t.delay !== undefined);
  const pending = rows.filter(t => t.status === 'Due, pending');
  const future = rows.filter(t => t.status === 'Not Yet Due');
  const partialCount = rows.filter(t => t.status === 'Partially Paid').length;
  if (paid.length < 2) return {rating:'unknown', label:'Not enough history', avgDelay:null, paid, pending, future, rows, partialCount};
  const avg = paid.reduce((s,t)=>s+t.delay,0) / paid.length;
  let rating, label;
  if (avg <= 7) { rating='green'; label='Reliable: on-time payer'; }
  else if (avg <= 21) { rating='yellow'; label='Occasional delays'; }
  else { rating='red'; label='Chronic delay pattern'; }
  return {rating, label, avgDelay: avg, paid, pending, future, rows, partialCount};
}
function effectiveRating(name){
  const computed = dashComputeRating(name);
  const override = OVERRIDES[name];
  if (override) return {...computed, rating: override, label: 'Manually set to ' + override, overridden: true};
  return computed;
}
const RATING_META = {
  green: {cls:'green', short:'Green'}, yellow: {cls:'yellow', short:'Yellow'},
  red: {cls:'red', short:'Red'}, unknown: {cls:'unknown', short:'N/A'},
};

function renderReliabilityMini(){
  const counts = {green:0, yellow:0, red:0, unknown:0};
  DATA.customers.forEach(c => { counts[effectiveRating(c.name).rating]++; });
  const el = document.getElementById('reliability-mini');
  if (!el) return;
  el.innerHTML = [
    {k:'green', l:'Green: reliable'}, {k:'yellow', l:'Yellow: watch'}, {k:'red', l:'Red: chase'}, {k:'unknown', l:'Not enough data'},
  ].map(t => `<div class="stat-tile rdrill" data-report="reliability" data-param="${t.k}"><div class="label">${t.l}</div>
    <div class="value" style="color:var(--status-${t.k === 'unknown' ? 'unknown' : (t.k==='green'?'good':(t.k==='yellow'?'warn':'critical'))})">${counts[t.k]}</div></div>`).join('');
}

/* ================= Customer 360 ================= */
function populateCustomerSelect(){
  const sel = document.getElementById('cust-select');
  sel.innerHTML = DATA.customers.map(c => `<option value="${c.name}">${titleCase(c.name)} &middot; ${c.wing}-${c.flat}</option>`).join('');
}

function closeOverrideMenu(){ document.getElementById('c360-override-menu').classList.remove('show'); }

function renderBadge(elBadge, elLabel, rating){
  const meta = RATING_META[rating.rating];
  elBadge.className = 'badge ' + meta.cls + (rating.overridden ? ' overridden' : '');
  elLabel.textContent = rating.label;
}

function renderCustomer360(name){
  const c = DATA.customers.find(x => x.name === name);
  if (!c) return;
  CURRENT_CUSTOMER = name;
  document.getElementById('cust-select').value = name;
  document.getElementById('c360-name').textContent = titleCase(c.name);
  document.getElementById('c360-meta').textContent =
    [c.project, c.tower ? 'Tower ' + c.tower : null, 'Flat ' + c.flat, c.type_ || null].filter(Boolean).join(' · ');

  const rating = effectiveRating(c.name);
  renderBadge(document.getElementById('c360-badge'), document.getElementById('c360-badge-label'), rating);
  const watchEl = document.getElementById('c360-watch');
  if (watchEl) watchEl.style.display = (rating.partialCount || 0) >= 2 ? 'inline-flex' : 'none';

  const balanceToPossession = c.agreement_value - c.received;
  document.getElementById('c360-financials').innerHTML = [
    {k:'Agreement value', v: fmtINR(c.agreement_value)},
    {k:'Received to date', v: fmtINR(c.received)},
    {k:'Balance (current stage)', v: fmtINR(c.balance)},
    {k:'Balance (to possession)', v: fmtINR(balanceToPossession)},
  ].map(t => `<div class="info-tile"><div class="k">${t.k}</div><div class="v small">${t.v}</div></div>`).join('');

  const isBank = c.bank !== 'OWN FUNDS';
  // the actual bank-sourced receipts, not "all money in" -- own funds are not a disbursement
  const src = STATE.customers.find(x => x.id === c.id) || STATE.customers.find(x => x.name === c.name);
  const prC = src ? fundingProgress(toCalcCustomer(src), STATE.collections) : null;
  const disbursedEst = isBank ? (prC ? prC.bankDisbursed : 0) : 0;
  const pendingDisb = isBank ? (prC ? prC.bankPending : Math.max(0, c.loan_amt - disbursedEst)) : 0;
  const liveMap = {
    'SANCTIONED': 'Sanctioned: 1st disbursement pending',
    'PARTLY DISBURSED': 'Next tranche pending bank action',
    'FULLY DISBURSED': 'Loan fully disbursed',
    'NOT STARTED': 'No loan process initiated / self-funded',
  };
  document.getElementById('c360-loan').innerHTML = [
    {k:'Bank / Own', v: titleCase(c.bank)},
    {k:'Loan sanctioned', v: fmtINR(c.loan_amt)},
    {k:'Disbursed to date', v: fmtINR(disbursedEst)},
    {k:'Pending disbursement', v: fmtINR(pendingDisb)},
    {k:'Status right now', v: liveMap[c.dl_status] || titleCase(c.dl_status)},
    {k:'File no. / Banker\'s no.', v: (c.file_no||'–') + ' / ' + (c.bankers_no||'–')},
  ].map(t => `<div class="info-tile"><div class="k">${t.k}</div><div class="v small">${t.v}</div></div>`).join('');

  document.getElementById('c360-ocr').innerHTML = [
    {k:'Own contribution required', v: fmtINR(prC ? prC.ownRequired : c.ocr_amt)},
    {k:'Own contribution received', v: fmtINR(prC ? prC.ownPaid : c.ocr_paid)},
    {k:'Still to arrange', v: fmtINR(prC ? prC.ownPending : Math.max(0, c.ocr_amt - c.ocr_paid))},
  ].map(t => `<div class="info-tile"><div class="k">${t.k}</div><div class="v small">${t.v}</div></div>`).join('');

  // ---------- timeline strip ----------
  // Wraps onto as many rows as the schedule needs (some towers run to 27 stages), with a
  // TODAY divider dropped in at the point the schedule has reached right now.
  const rows = rating.rows.slice().sort((a,b) => (a.due_date||'').localeCompare(b.due_date||''));
  const now = new Date();
  const tlState = (t) => {
    if (t.status === 'Paid') return t.delay <= 7 ? 'paid' : (t.delay <= 21 ? 'late' : 'verylate');
    if (t.status === 'Partially Paid') return 'partial';
    if (t.status === 'Due, pending') return 'overdue';
    return 'future';
  };
  const TL_COLOR = {
    paid:     'var(--status-good)',
    late:     'var(--status-warn)',
    verylate: 'var(--status-critical)',
    partial:  'var(--status-serious)',
    overdue:  'var(--status-critical)',
    future:   'var(--status-unknown)',
  };
  let todayPlaced = false;
  const cells = [];
  rows.forEach((t, i) => {
    // drop the TODAY divider before the first milestone whose due date is still ahead of us
    if (!todayPlaced && t.due_date && new Date(t.due_date) > now) {
      cells.push(`<div class="tl-today"><span class="tl-today-line"></span><span class="tl-today-tag">TODAY<br>${fmtDate(now.toISOString())}</span></div>`);
      todayPlaced = true;
    }
    const st = tlState(t);
    const lateTxt = (d) => d>0 ? d+' days late' : (d<0 ? Math.abs(d)+' days early' : 'On time');
    const tip = t.status === 'Paid'
      ? `<b>${t.milestone}</b>${fmtINR(t.amount)}<br>Due ${fmtDate(t.due_date)} · Paid ${fmtDate(t.paid_date)}<br>${lateTxt(t.delay)}`
      : t.status === 'Partially Paid'
      ? `<b>${t.milestone}</b>${fmtINR(t.amount_paid||0)} of ${fmtINR(t.amount)} paid<br>Due ${fmtDate(t.due_date)} · Paid ${fmtDate(t.paid_date)}${t.delay!=null?'<br>'+lateTxt(t.delay):''}${t.reason ? '<br>Reason: '+t.reason : ''}`
      : t.status === 'Due, pending'
      ? `<b>${t.milestone}</b>${fmtINR(t.amount)}<br>Due ${fmtDate(t.due_date)}<br><b>Overdue: nothing recorded</b>`
      : `<b>${t.milestone}</b>${fmtINR(t.amount)}<br>Due ${fmtDate(t.due_date)}<br>Not yet due`;
    cells.push(`<div class="tl-cell ${st}">
      <div class="tl-rail"></div>
      <div class="tl-dot" style="background:${TL_COLOR[st]}" data-tip="${tip.replace(/"/g,'&quot;')}"></div>
      <div class="tl-when">${t.due_date ? fmtDate(t.due_date) : ''}</div>
      <div class="tl-label">${t.milestone}</div>
    </div>`);
  });
  if (!todayPlaced && rows.length) {
    cells.push(`<div class="tl-today"><span class="tl-today-line"></span><span class="tl-today-tag">TODAY<br>${fmtDate(now.toISOString())}</span></div>`);
  }
  document.getElementById('c360-timeline').innerHTML = cells.join('') ||
    '<div class="axis-label">No milestone schedule for this unit yet.</div>';
  document.querySelectorAll('#c360-timeline .tl-dot').forEach(el => {
    el.addEventListener('mousemove', e => showTip(e, el.getAttribute('data-tip')));
    el.addEventListener('mouseleave', hideTip);
  });
  const nOver = rows.filter(t => t.status === 'Due, pending').length;
  const nPart = rows.filter(t => t.status === 'Partially Paid').length;
  const nPaid = rows.filter(t => t.status === 'Paid').length;
  document.getElementById('c360-timeline-summary').innerHTML =
    `<b>${nPaid}</b> paid · <b class="${nPart?'warn-txt':''}">${nPart}</b> partially paid · ` +
    `<b class="${nOver?'crit-txt':''}">${nOver}</b> overdue &amp; unpaid · <b>${rows.length - nPaid - nPart - nOver}</b> not yet due`;

  document.getElementById('c360-timeline-legend').innerHTML = `
    <div class="item"><span class="swatch" style="background:var(--status-good)"></span>Paid on time</div>
    <div class="item"><span class="swatch" style="background:var(--status-warn)"></span>Paid late (8–21d)</div>
    <div class="item"><span class="swatch" style="background:var(--status-critical)"></span>Paid very late (&gt;21d)</div>
    <div class="item"><span class="swatch" style="background:var(--status-serious)"></span>Partially paid</div>
    <div class="item"><span class="swatch ring" style="background:var(--status-critical)"></span>Overdue: nothing received</div>
    <div class="item"><span class="swatch" style="background:var(--status-unknown)"></span>Not yet due</div>`;

  // forward schedule (pending + partially-paid + future)
  const upcoming = rows.filter(t => t.status !== 'Paid');
  document.getElementById('c360-schedule').innerHTML = upcoming.length
    ? `<thead><tr><th>Milestone</th><th class="num">Amount</th><th>Est. due date</th><th>Status</th></tr></thead>
       <tbody>${upcoming.map(t => {
         const isPartial = t.status === 'Partially Paid';
         const amtLabel = isPartial ? `${fmtINR(t.amount_paid||0)} of ${fmtINR(t.amount)}` : fmtINR(t.amount);
         const cls = t.status==='Due, pending' ? 'status-pending' : (isPartial ? 'status-partial' : 'status-future');
         return `<tr><td>${t.milestone}</td><td class="num">${amtLabel}</td><td>${fmtDate(t.due_date)}</td>
           <td class="${cls}">${t.status}</td></tr>`;
       }).join('')}</tbody>`
    : `<tbody><tr><td>All milestones paid.</td></tr></tbody>`;
}

function setupOverrideMenu(){
  const badge = document.getElementById('c360-badge');
  const menu = document.getElementById('c360-override-menu');
  const opts = [
    {k:'green', l:'Mark Green'}, {k:'yellow', l:'Mark Yellow'}, {k:'red', l:'Mark Red'}, {k:null, l:'Reset to auto'},
  ];
  menu.innerHTML = opts.map(o => `<div class="opt" data-k="${o.k||''}"><span class="dot" style="background:var(--status-${o.k==='green'?'good':o.k==='yellow'?'warn':o.k==='red'?'critical':'unknown'})"></span>${o.l}</div>`).join('');
  badge.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('show'); });
  menu.querySelectorAll('.opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const k = opt.getAttribute('data-k');
      if (k) OVERRIDES[CURRENT_CUSTOMER] = k; else delete OVERRIDES[CURRENT_CUSTOMER];
      closeOverrideMenu();
      renderCustomer360(CURRENT_CUSTOMER);
      renderReliabilityList();
      renderReliabilityMini();
    });
  });
  document.addEventListener('click', closeOverrideMenu);
}

document.getElementById('cust-select').addEventListener('change', (e) => renderCustomer360(e.target.value));
document.getElementById('cust-prev').addEventListener('click', () => stepCustomer(-1));
document.getElementById('cust-next').addEventListener('click', () => stepCustomer(1));
function stepCustomer(dir){
  const names = DATA.customers.map(c => c.name);
  let idx = names.indexOf(CURRENT_CUSTOMER);
  idx = (idx + dir + names.length) % names.length;
  renderCustomer360(names[idx]);
}

/* ================= Reliability tab ================= */
function jumpToCustomer(name){
  renderCustomer360(name);
  document.querySelector('.tab-btn[data-tab="customer"]').click();
}
/* Ranked worst-first over the whole book, which is 678 rows: without a filter and a pager
   the only thing this list could tell you was who the very worst payer was. */
const REL_FILTER = { colours: new Set(['red', 'yellow', 'green', 'unknown']), q: '' };
function renderReliabilityList(){
  const unitLabel = c => {
    const f = String(c.flat || ''), w = String(c.wing || '');
    if (!w) return f;
    return flatKey(w, f) === f.toUpperCase().replace(/[^A-Z0-9]/g, '') ? `${w}-${f}` : f;
  };
  const all = DATA.customers.map(c => ({name:c.name, unit: unitLabel(c), rating: effectiveRating(c.name)}));
  const counts = { red:0, yellow:0, green:0, unknown:0 };
  all.forEach(r => { counts[r.rating.rating] = (counts[r.rating.rating] || 0) + 1; });
  document.querySelectorAll('#rel-filter .rel-chip').forEach(b => {
    const k = b.dataset.rel;
    b.classList.toggle('on', REL_FILTER.colours.has(k));
    b.querySelector('.n').textContent = counts[k] || 0;
  });
  const q = REL_FILTER.q.trim().toLowerCase();
  const rows = all.filter(r => REL_FILTER.colours.has(r.rating.rating)
    && (!q || r.name.toLowerCase().includes(q) || String(r.unit).toLowerCase().includes(q)));
  rows.sort((a,b) => {
    const order = {red:0, yellow:1, unknown:2, green:3};
    return order[a.rating.rating] - order[b.rating.rating] || (b.rating.avgDelay||0) - (a.rating.avgDelay||0);
  });
  const shown = document.getElementById('rel-shown');
  if (shown) shown.textContent = rows.length === all.length
    ? `${all.length} customer${all.length === 1 ? '' : 's'}`
    : `showing ${rows.length} of ${all.length}`;
  const colorOf = r => r==='green' ? 'var(--status-good)' : r==='yellow' ? 'var(--status-warn)' : r==='red' ? 'var(--status-critical)' : 'var(--status-unknown)';
  const page = pageSlice('reliability', rows);
  renderPager('rel-pager', 'reliability', rows.length, renderReliabilityList);
  document.getElementById('reliability-list').innerHTML = (page.length ? page : []).map(r => {
    const meta = RATING_META[r.rating.rating];
    const barPct = r.rating.avgDelay === null ? 0 : Math.min(100, Math.max(4, (Math.abs(r.rating.avgDelay)/45*100)));
    const watched = (r.rating.partialCount || 0) >= 2;
    return `<div class="rel-row">
      <div><div class="rn" data-name="${r.name}">${titleCase(r.name)}</div><div class="rmeta">${r.unit}${watched?' · <span style="color:var(--status-critical);font-weight:700;">Watch</span>':''}</div></div>
      <span class="badge ${meta.cls}${r.rating.overridden?' overridden':''}" data-name-badge="${r.name}"><span class="dot"></span>${meta.short}</span>
      <div class="rbar-track"><div class="rbar-fill" style="width:${barPct}%;background:${colorOf(r.rating.rating)}"></div></div>
      <div class="rmeta" style="text-align:right;">${r.rating.avgDelay===null?'–':(r.rating.avgDelay>=0?'+':'')+Math.round(r.rating.avgDelay)+'d avg'}</div>
    </div>`;
  }).join('') || `<div class="rel-legend-note" style="padding:18px;">Nothing matches these colours.</div>`;
  document.querySelectorAll('#reliability-list .rn').forEach(el => el.addEventListener('click', () => jumpToCustomer(el.getAttribute('data-name'))));
  document.querySelectorAll('#reliability-list [data-name-badge]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = el.getAttribute('data-name-badge');
      const order = ['green','yellow','red', null];
      const cur = OVERRIDES[name] || null;
      const next = order[(order.indexOf(cur) + 1) % order.length];
      if (next) OVERRIDES[name] = next; else delete OVERRIDES[name];
      renderReliabilityList();
      renderReliabilityMini();
      if (CURRENT_CUSTOMER === name) renderCustomer360(name);
    });
  });
}

/* colour chips: multi-select, and never all-off (an empty list helps nobody) */
document.getElementById('rel-filter').addEventListener('click', e => {
  const b = e.target.closest('.rel-chip');
  if (b) {
    const k = b.dataset.rel;
    if (REL_FILTER.colours.has(k)) { if (REL_FILTER.colours.size > 1) REL_FILTER.colours.delete(k); }
    else REL_FILTER.colours.add(k);
    pagerReset('reliability');
    renderReliabilityList();
    return;
  }
  if (e.target.id === 'rel-all') {
    REL_FILTER.colours = new Set(['red', 'yellow', 'green', 'unknown']);
    REL_FILTER.q = '';
    document.getElementById('rel-search').value = '';
    pagerReset('reliability');
    renderReliabilityList();
  }
});
document.getElementById('rel-search').addEventListener('input', e => {
  REL_FILTER.q = e.target.value;
  pagerReset('reliability');
  renderReliabilityList();
});

/* ================= tabs ================= */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const t = btn.getAttribute('data-tab');
    document.getElementById('tab-' + t).classList.add('active');
    if (t === 'forecast') renderForecast();
    if (typeof syncRail === 'function') syncRail();
  });
});

/* ================= forecast: predicted against reality =================
   The payment schedule IS the builder's own prediction, so the honest comparison needs
   no stored snapshots: for any period, what the schedule asked for against what actually
   arrived. Past periods show the track record; future periods fan out into the three
   confidence bands. The gap between the two lines in the past is, precisely, the arrears.
*/
const FC_HORIZONS = [
  { key: 'd7',   label: 'Next 7 days',     days: 7 },
  { key: 'd14',  label: 'Next 2 weeks',    days: 14 },
  { key: 'd30',  label: 'Next month',      days: 30 },
  { key: 'd60',  label: 'Next 2 months',   days: 60 },
  { key: 'd90',  label: 'Next 3 months',   days: 90 },
  { key: 'd182', label: 'Next 6 months',   days: 182 },
];

function fcBucketPlan(days) {
  if (days <= 14) return { step: 'day', n: days };
  if (days <= 90) return { step: 'week', n: Math.ceil(days / 7) };
  return { step: 'month', n: Math.ceil(days / 30) };
}
function fcAddStep(d, step, k) {
  const x = new Date(d);
  if (step === 'day') x.setDate(x.getDate() + k);
  else if (step === 'week') x.setDate(x.getDate() + 7 * k);
  else x.setMonth(x.getMonth() + k);
  return startOfDay(x);
}
function fcTick(d, step) {
  if (step === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/* One row per bucket, running from `n` steps before today to `n` steps after. */
function forecastSeries(days) {
  const plan = fcBucketPlan(days);
  const today = startOfDay(new Date());
  const edges = [];
  for (let i = -plan.n; i <= plan.n; i++) edges.push(fcAddStep(today, plan.step, i));
  const buckets = edges.slice(0, -1).map((from, i) => ({
    from, to: edges[i + 1], label: fcTick(from, plan.step),
    future: edges[i + 1] > today,
    demanded: 0, received: 0, green: 0, amber: 0, red: 0,
  }));
  const put = (when, key, amt) => {
    if (!when) return;
    const d = startOfDay(when);
    for (const b of buckets) if (d >= b.from && d < b.to) { b[key] += amt; return; }
  };

  // what the schedule asked for, and what actually arrived
  const live = visibleCustomers().filter(isLiveBooking);
  const names = new Set(live.map(c => c.name));
  live.forEach(c => {
    const prog = fundingProgress(toCalcCustomer(c), STATE.collections);
    ownContributionPlan(c, prog).forEach(r => {
      put(r.due, 'demanded', (r.settled ? r.amount : r.outstanding) + (r.gst || 0));
    });
  });
  STATE.collections.forEach(e => {
    if (!names.has(e.customer) || !e.date) return;
    put(e.date instanceof Date ? e.date : new Date(e.date), 'received', (e.flatCost || 0) + (e.gst || 0));
  });
  // the confidence split, on future demands only
  forecastRows().forEach(r => {
    if (!r.due || startOfDay(r.due) <= today) return;
    put(r.due, r.band, r.amount);
  });

  // cumulative, which is the shape of the question "how much by then"
  let cd = 0, cr = 0, cg = 0, ca = 0, cx = 0;
  let anchorReceived = 0;
  buckets.forEach(b => {
    cd += b.demanded; b.cumDemanded = cd;
    if (!b.future) { cr += b.received; anchorReceived = cr; }
    b.cumReceived = b.future ? null : cr;
    if (b.future) {
      cg += b.green; ca += b.amber; cx += b.red;
      b.cumGreen = anchorReceived + cg;
      b.cumAmber = anchorReceived + cg + ca;
      b.cumRed   = anchorReceived + cg + ca + cx;
    } else { b.cumGreen = b.cumAmber = b.cumRed = null; }
  });
  // the projections must start where reality stopped, or the lines float
  const lastPast = [...buckets].reverse().find(b => !b.future);
  if (lastPast) { lastPast.cumGreen = lastPast.cumAmber = lastPast.cumRed = lastPast.cumReceived; }
  return { buckets, today, step: plan.step, anchorReceived };
}

/* ================= the daily brief =================
   What went out today, against what was meant to, and what to lean on tomorrow. The
   application has no server, so it cannot post the mail itself: it composes the whole
   thing and hands it to the mail client with the primary contacts already addressed. */
function briefFor(project) {
  const today = startOfDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const inProject = (name) => {
    if (!project) return true;
    const c = STATE.customers.find(x => x.name === name);
    return c && c.projectId === project.id;
  };
  const money = (e) => (e.flatCost || 0) + (e.gst || 0);
  let todayTotal = 0, todayCount = 0, monthTotal = 0, monthCount = 0;
  STATE.collections.forEach(e => {
    if (!e.date || !inProject(e.customer)) return;
    const d = startOfDay(e.date instanceof Date ? e.date : new Date(e.date));
    if (+d === +today) { todayTotal += money(e); todayCount++; }
    if (d >= monthStart) { monthTotal += money(e); monthCount++; }
  });

  const rows = forecastRows().filter(r => !project || r.project === project.name);
  const buckets = forecastBuckets(rows);
  const arrears = buckets.find(b => b.key === 'overdue') || { total: 0, count: 0, red: 0 };
  const month = buckets.find(b => b.key === 'month') || { total: 0, green: 0, amber: 0, red: 0 };

  // what to lean on tomorrow: the biggest amounts that are still winnable
  const chase = rows.filter(r => r.daysOut > 0 && r.band !== 'red')
                    .sort((a, b) => b.amount - a.amount).slice(0, 6);
  const stuck = rows.filter(r => r.share === 'bank' && /not sanctioned|no loan|rejected/.test(r.why.join(' ')))
                    .sort((a, b) => b.amount - a.amount).slice(0, 4);

  const interestTotal = rows.reduce((a, r) => a + (r.interest || 0), 0);
  return { project, today, todayTotal, todayCount, monthTotal, monthCount,
           monthTarget: month.total + monthTotal, arrears, month, chase, stuck, interestTotal };
}

function briefText(b) {
  const L = [];
  const name = b.project ? b.project.name : 'All projects';
  const inr = (n) => fmtINR(Math.round(n));
  L.push(`${name} — collection summary for ${fmtDate(b.today)}`);
  L.push('');
  L.push(`Received today            ${inr(b.todayTotal)}   (${b.todayCount} receipt${b.todayCount === 1 ? '' : 's'})`);
  L.push(`Month to date             ${inr(b.monthTotal)}   (${b.monthCount} receipt${b.monthCount === 1 ? '' : 's'})`);
  L.push(`Still expected this month ${inr(b.month.total)}`);
  L.push(`  of which confident      ${inr(b.month.green)}`);
  L.push(`  likely                  ${inr(b.month.amber)}`);
  L.push(`  at risk                 ${inr(b.month.red)}`);
  L.push('');
  L.push(`Overdue and unpaid        ${inr(b.arrears.total)}   across ${b.arrears.count} demand${b.arrears.count === 1 ? '' : 's'}`);
  if (b.chase.length) {
    L.push('');
    L.push('Worth chasing tomorrow');
    b.chase.forEach(r => L.push(`  ${r.customer} (${r.flat || '-'})  ${inr(r.amount)}  ${r.daysOut} days late  ${r.share === 'bank' ? 'bank' : 'own funds'}`
      + (r.interest > 0 ? `  (+${inr(r.interest)} interest)` : '')));
  }
  if (b.interestTotal > 0) {
    L.push('');
    L.push(`Delay interest accrued     ${inr(b.interestTotal)}   at ${cfg('delayInterestPct')}% a year, after ${cfg('delayGraceDays')} days' grace`);
  }
  if (b.stuck.length) {
    L.push('');
    L.push('Waiting on a bank');
    b.stuck.forEach(r => L.push(`  ${r.customer} (${r.flat || '-'})  ${inr(r.amount)}  ${r.why[r.why.length - 1]}`));
  }
  L.push('');
  L.push('Prepared by Perfect Solutions.');
  return L.join('\n');
}

function openDailyBrief() {
  const p = ctxProject();
  const b = briefFor(p);
  const text = briefText(b);
  const to = p ? primaryContacts(p) : [];
  const box = document.getElementById('brief-body');
  document.getElementById('brief-modal').classList.add('show');
  const who = to.length
    ? `Goes to <b>${to.map(c => esc(c.name || c.email)).join('</b>, <b>')}</b>`
    : (p ? `<span class="warn-text">Nobody at ${esc(p.name)} is ticked for the daily brief yet — open the project and tick someone, or copy the text below.</span>`
         : `<span class="warn-text">Pick a single project above and the brief goes to that project's people.</span>`);
  box.innerHTML = `<div class="brief-to">${who}</div>
    <textarea id="brief-text" rows="18" spellcheck="false">${esc(text)}</textarea>`;
  const send = document.getElementById('btn-brief-send');
  send.disabled = !to.length;
  send.onclick = () => {
    const body = document.getElementById('brief-text').value;
    const subject = `${p ? p.name : 'Collections'} — collection summary ${fmtDate(b.today)}`;
    location.href = `mailto:${to.map(c => c.email).join(',')}`
      + `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  document.getElementById('btn-brief-copy').onclick = () => {
    const ta = document.getElementById('brief-text');
    ta.select(); document.execCommand('copy');
    notify('Copied. Paste it wherever you like.');
  };
}

/* ================= forecast rendering ================= */
let FC = { window: 'overdue', band: 'all', cache: null };

function fcPill(b) { return `<span class="fc-pill ${b}">${b}</span>`; }

/* The chart palette. Light passes every check in the validator; dark trades the
   lightness band on amber for legibility on a dark ground, which is why every series
   also carries a dash pattern, a direct end label and a legend -- colour is never the
   only thing telling them apart, and the table view carries every value without it. */
function fcPalette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme')
        && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return dark
    ? { received: '#3987e5', green: '#2fa96e', amber: '#dda01f', red: '#e66767', demanded: '#8b8b84' }
    : { received: '#2a78d6', green: '#127c4a', amber: '#e8a200', red: '#c62f2f', demanded: '#7a7a72' };
}

let FCC = { horizon: 'd90', mode: 'cum', show: { green: true, amber: true, red: true }, table: false, data: null };

function renderForecastChart() {
  const host = document.getElementById('fc-chart-host');
  if (!host) return;
  const days = (FC_HORIZONS.find(h => h.key === FCC.horizon) || FC_HORIZONS[4]).days;
  const S = forecastSeries(days);
  FCC.data = S;
  const P = fcPalette();
  const cum = FCC.mode === 'cum';

  const W = 1000, H = 348, mL = 66, mR = 78, mT = 14, mB = 46;
  const iw = W - mL - mR, ih = H - mT - mB;
  const B = S.buckets;
  if (!B.length) { host.innerHTML = ''; return; }

  const val = (b, k) => {
    if (cum) return b['cum' + k[0].toUpperCase() + k.slice(1)];
    return k === 'received' ? (b.future ? null : b.received)
         : k === 'demanded' ? b.demanded
         : (b.future ? b[k] : null);
  };
  const keys = ['demanded', 'received']
    .concat(FCC.show.green ? ['green'] : [], FCC.show.amber ? ['amber'] : [], FCC.show.red ? ['red'] : []);
  let hi = 0;
  B.forEach(b => keys.forEach(k => { const v = val(b, k); if (v != null && v > hi) hi = v; }));
  hi = hi || 1;
  const step = Math.pow(10, Math.floor(Math.log10(hi)));
  const top = Math.ceil(hi / step) * step;
  const x = i => mL + (B.length === 1 ? iw / 2 : (i / (B.length - 1)) * iw);
  const y = v => mT + ih - (v / top) * ih;

  const path = (k) => {
    let d = '', open = false;
    B.forEach((b, i) => {
      const v = val(b, k);
      if (v == null) { open = false; return; }
      d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      open = true;
    });
    return d.trim();
  };

  // gridlines and y ticks
  const ticks = 4;
  let grid = '', ylab = '';
  for (let t = 0; t <= ticks; t++) {
    const v = (top / ticks) * t, yy = y(v);
    grid += `<line class="fc-grid" x1="${mL}" y1="${yy.toFixed(1)}" x2="${mL + iw}" y2="${yy.toFixed(1)}"></line>`;
    ylab += `<text class="fc-axis num" x="${mL - 10}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end">${fmtCompact(v)}</text>`;
  }
  // x ticks: never more than about eight, so labels never collide
  const every = Math.max(1, Math.ceil(B.length / 8));
  let xlab = '';
  B.forEach((b, i) => {
    if (i % every) return;
    xlab += `<text class="fc-axis" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>`;
  });

  // the today marker sits on the boundary between the last past bucket and the first future one
  const firstFuture = B.findIndex(b => b.future);
  const nowX = firstFuture <= 0 ? x(0) : (x(firstFuture - 1) + x(firstFuture)) / 2;

  const dash = { demanded: '2 3', received: '', green: '5 4', amber: '5 4', red: '5 4' };
  const nameOf = { demanded: 'Asked for', received: 'Received', green: 'Confident',
                   amber: 'Likely', red: 'At risk' };
  let lines = '';
  const endPts = [];
  keys.forEach(k => {
    const d = path(k);
    if (!d) return;
    lines += `<path class="fc-line" d="${d}" stroke="${P[k]}"${dash[k] ? ` stroke-dasharray="${dash[k]}"` : ''}${
      k === 'demanded' ? ' stroke-width="1.5" opacity="0.85"' : ''}></path>`;
    // direct-label the endpoint only -- never a number on every point
    let li = -1;
    B.forEach((b, i) => { if (val(b, k) != null) li = i; });
    if (li >= 0) endPts.push({ k, x: x(li), y: y(val(B[li], k)), v: val(B[li], k) });
  });
  /* two projections that finish close together would print their labels on top of each
     other, so the text is nudged apart while the dot stays on the line */
  endPts.sort((a, b) => a.y - b.y);
  endPts.forEach((e, i) => {
    e.ly = e.y;
    if (i && e.ly - endPts[i - 1].ly < 13) e.ly = endPts[i - 1].ly + 13;
  });
  /* a series that finishes mid-chart -- Received stops at today -- would print its label
     straight through the projections starting at the same point, so it is set above the
     dot instead of beside it */
  const rightEdge = x(B.length - 1);
  const ends = endPts.map(e => {
    const mid = e.x < rightEdge - 24;
    const t = mid
      ? `<text class="fc-end" x="${e.x.toFixed(1)}" y="${(e.y - 10).toFixed(1)}" text-anchor="middle" fill="${P[e.k]}">${fmtCompact(e.v)}</text>`
      : `<text class="fc-end" x="${(e.x + 9).toFixed(1)}" y="${(e.ly + 3.5).toFixed(1)}" fill="${P[e.k]}">${fmtCompact(e.v)}</text>`;
    return `<circle class="fc-dot" cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="3.5" fill="${P[e.k]}"></circle>` + t;
  }).join('');

  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="What the payment schedule asked for against what was received, with the forecast split into confident, likely and at-risk money.">
      ${grid}${ylab}${xlab}
      <line class="fc-now" x1="${nowX.toFixed(1)}" y1="${mT}" x2="${nowX.toFixed(1)}" y2="${mT + ih + 5}"></line>
      <text class="fc-now-lab" x="${nowX.toFixed(1)}" y="${mT + ih + 17}" text-anchor="middle">today</text>
      ${lines}${ends}
      <g id="fc-cross-g" style="display:none"><line class="fc-cross" y1="${mT}" y2="${mT + ih}"></line></g>
      <rect class="fc-hit" x="${mL}" y="${mT}" width="${iw}" height="${ih}"></rect>
    </svg>
    <div class="fc-tip" id="fc-tip"></div>
    <div class="fc-legend2">${keys.map(k =>
      `<span><i style="${dash[k] ? `border-top:2.5px ${k === 'demanded' ? 'dotted' : 'dashed'} ${P[k]};height:0;background:none` : `background:${P[k]}`}"></i>${nameOf[k]}</span>`).join('')}</div>`;

  // ---- crosshair + tooltip: the reader aims at a date, never at a 2px line ----
  const svg = host.querySelector('svg');
  const tip = host.querySelector('#fc-tip');
  const crossG = host.querySelector('#fc-cross-g');
  const cross = crossG.querySelector('line');
  const hit = host.querySelector('.fc-hit');
  const show = (i, clientX) => {
    const b = B[i];
    crossG.style.display = '';
    cross.setAttribute('x1', x(i).toFixed(1)); cross.setAttribute('x2', x(i).toFixed(1));
    const row = (k) => {
      const v = val(b, k);
      if (v == null) return '';
      return `<div class="r"><i style="background:${P[k]}"></i><span>${nameOf[k]}</span><b>${fmtINR(Math.round(v))}</b></div>`;
    };
    const gap = (val(b, 'demanded') != null && val(b, 'received') != null)
      ? Math.round(val(b, 'demanded') - val(b, 'received')) : null;
    tip.innerHTML = `<div class="h"></div>${keys.map(row).join('')}` +
      (gap != null && gap > 0 ? `<div class="r" style="margin-top:6px;opacity:.75"><span>Short by</span><b>${fmtINR(gap)}</b></div>` : '');
    tip.querySelector('.h').textContent = (cum ? 'By ' : '') + b.label + (b.future ? '  (forecast)' : '');
    tip.classList.add('on');
    const hr = host.getBoundingClientRect();
    const px = (x(i) / W) * hr.width;
    tip.style.left = Math.max(4, Math.min(hr.width - tip.offsetWidth - 4, px + 14)) + 'px';
    tip.style.top = '14px';
  };
  const nearest = (ev) => {
    const hr = svg.getBoundingClientRect();
    const px = ((ev.clientX - hr.left) / hr.width) * W;
    let best = 0, bd = Infinity;
    B.forEach((b, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  hit.addEventListener('pointermove', ev => show(nearest(ev), ev.clientX));
  hit.addEventListener('pointerleave', () => { tip.classList.remove('on'); crossG.style.display = 'none'; });

  // ---- the table twin: every value reachable without hovering ----
  const tb = document.getElementById('fc-chart-tbody');
  if (tb) tb.innerHTML = B.map(b => `<tr>
      <td>${esc(b.label)}${b.future ? ' <span class="fc-src">forecast</span>' : ''}</td>
      <td class="num">${fmtINR(Math.round(val(b, 'demanded') || 0))}</td>
      <td class="num">${val(b, 'received') == null ? NIL : fmtINR(Math.round(val(b, 'received')))}</td>
      <td class="num">${val(b, 'green') == null ? NIL : fmtINR(Math.round(val(b, 'green')))}</td>
      <td class="num">${val(b, 'amber') == null ? NIL : fmtINR(Math.round(val(b, 'amber')))}</td>
      <td class="num">${val(b, 'red') == null ? NIL : fmtINR(Math.round(val(b, 'red')))}</td>
    </tr>`).join('');

  const sub = document.getElementById('fc-chart-sub');
  if (sub) sub.textContent = cum
    ? 'Running totals across the window. Left of the marker is what happened; right of it, where the three confidence bands land.'
    : 'Each period on its own. Left of the marker is what happened; right of it, what the three confidence bands expect.';
}

function renderForecast() {
  const rows = forecastRows();
  const buckets = forecastBuckets(rows);
  FC.cache = { rows, buckets };

  const host = document.getElementById('fc-cards');
  if (host) {
    if (!rows.length) {
      host.innerHTML = `<div class="fc-card"><div class="h">Nothing open</div>
        <div class="tot">${fmtCompact(0)}</div>
        <div class="cnt">Every demand in view is settled, or no payment schedule is set.</div></div>`;
    } else {
      host.innerHTML = buckets.map(b => {
        const t = b.total || 1;
        const seg = (k) => b[k] > 0 ? `<i class="${k}" style="width:${(b[k] / t * 100).toFixed(2)}%"></i>` : '';
        const line = (k, name) => `<span><i class="fcd ${k}"></i>${name}<b>${fmtCompact(b[k])}</b></span>`;
        return `<div class="fc-card">
          <div class="h">${esc(b.label)}</div>
          <div class="tot">${fmtCompact(b.total)}</div>
          <div class="cnt">${b.count} open demand${b.count === 1 ? '' : 's'}${b.arrears ? ' \u00b7 past their date' : ''}</div>
          <div class="fc-bar">${seg('green')}${seg('amber')}${seg('red')}</div>
          <div class="fc-split">${line('green', 'Confident')}${line('amber', 'Likely')}${line('red', 'At risk')}</div>
        </div>`;
      }).join('');
    }
  }

  // the chart controls, wired once
  const hsel = document.getElementById('fc-horizon');
  if (hsel && !hsel.options.length) {
    hsel.innerHTML = FC_HORIZONS.map(h => `<option value="${h.key}">${h.label}</option>`).join('');
    hsel.value = FCC.horizon;
    hsel.addEventListener('change', () => { FCC.horizon = hsel.value; renderForecastChart(); });
    const msel = document.getElementById('fc-mode');
    msel.addEventListener('change', () => { FCC.mode = msel.value; renderForecastChart(); });
    [['fc-t-green', 'green'], ['fc-t-amber', 'amber'], ['fc-t-red', 'red']].forEach(([id, k]) => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => { FCC.show[k] = el.checked; renderForecastChart(); });
    });
    const tt = document.getElementById('fc-table-toggle');
    tt.addEventListener('click', () => {
      FCC.table = !FCC.table;
      document.getElementById('fc-chart-host').style.display = FCC.table ? 'none' : '';
      document.getElementById('fc-chart-table').style.display = FCC.table ? '' : 'none';
      tt.textContent = FCC.table ? 'View as chart' : 'View as table';
    });
  }
  renderForecastChart();

  const wsel = document.getElementById('fc-window');
  if (wsel && !wsel.options.length) {
    wsel.innerHTML = FORECAST_HORIZONS.map(h => `<option value="${h.key}">${h.label}</option>`).join('');
    wsel.value = FC.window;
    wsel.addEventListener('change', () => { FC.window = wsel.value; pagerState('forecast').page = 1; renderForecastTable(); });
    const bsel = document.getElementById('fc-band');
    bsel.addEventListener('change', () => { FC.band = bsel.value; pagerState('forecast').page = 1; renderForecastTable(); });
  }
  renderForecastTable();
}

function renderForecastTable() {
  if (!FC.cache) return;
  const bucket = FC.cache.buckets.find(b => b.key === FC.window) || FC.cache.buckets[0];
  let rows = bucket ? bucket.rows : [];
  if (FC.band !== 'all') rows = rows.filter(r => r.band === FC.band);
  const rank = { red: 0, amber: 1, green: 2 };
  rows = rows.slice().sort((a, b) => (rank[a.band] - rank[b.band]) || (b.amount - a.amount));

  const sub = document.getElementById('fc-detail-sub');
  const intTotal = rows.reduce((a, r) => a + (r.interest || 0), 0);
  if (sub) sub.textContent = bucket
    ? `${rows.length} open demand${rows.length === 1 ? '' : 's'} \u00b7 ${esc(bucket.label.toLowerCase())} \u00b7 ${fmtINR(rows.reduce((a, r) => a + r.amount, 0))}`
      + (intTotal > 0 ? ` \u00b7 ${fmtINR(intTotal)} of delay interest has accrued on these` : '')
    : '';

  const body = document.getElementById('fc-body');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" class="empty-row">Nothing open in this window.</td></tr>`;
    renderPager('fc-pager', 'forecast', 0, renderForecastTable);
    return;
  }
  const page = pageSlice('forecast', rows);
  body.innerHTML = page.map(r => `<tr>
    <td><a href="#" class="fc-link" data-fc-cust="${esc(r.customer)}">${esc(r.customer)}</a></td>
    <td>${esc(r.flat || '')}</td>
    <td>${esc(r.label)}</td>
    <td>${r.due ? fmtDate(r.due) : '\u2014'}${r.daysOut > 0 ? ` <span class="fc-src">${r.daysOut}d late</span>` : ''}</td>
    <td><span class="fc-src">${r.share === 'bank' ? 'Bank' : 'Own funds'}</span></td>
    <td class="num">${fmtINR(r.amount)}</td>
    <td class="num">${r.interest > 0 ? `<span class="fc-int">${fmtINR(r.interest)}</span>` : NIL}</td>
    <td>${fcPill(r.band)}</td>
    <td class="fc-why">${esc(r.why.join(' \u00b7 '))}</td>
  </tr>`).join('');
  renderPager('fc-pager', 'forecast', rows.length, renderForecastTable);
  body.querySelectorAll('[data-fc-cust]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); jumpToCustomer(a.dataset.fcCust); });
  });
}

function renderAll(){
  DATA = buildDashboardData();
  const emptyEl = document.getElementById('dash-empty');
  const bodyEl  = document.getElementById('dash-body');
  if (!DATA.customers.length) {
    emptyEl.style.display = 'block'; bodyEl.style.display = 'none';
    emptyEl.innerHTML = STATE.customers.length
      ? 'No units match the current <b>Project / Tower</b> selection.'
      : 'Nothing to chart yet: add a project, a tower and a customer and this dashboard fills in automatically.';
    return;
  }
  emptyEl.style.display = 'none'; bodyEl.style.display = 'block';
  renderKpis();
  renderDonut();
  renderHBar('bank-bar-chart', 'bank-bar-table', DATA.bank_loan.filter(b => b.bank !== 'OWN FUNDS'),
             'bank', 'amount', 'var(--series-1)', 'Bank', null, 'bank');
  renderBalanceChart();
  renderDailyColumns();
  renderMilestoneMeter();
  renderWingMeter();
  renderGst();
  renderOcr();
  renderAgeing();
  renderReliabilityMini();
  populateCustomerSelect();
  const keep = DATA.customers.some(c => c.name === CURRENT_CUSTOMER) ? CURRENT_CUSTOMER : DATA.customers[0].name;
  renderCustomer360(keep);
  renderReliabilityList();
  /* the forecast reads visibleCustomers() like everything else, so it has to be redrawn
     whenever the builder / project / tower selection above changes -- otherwise it keeps
     showing the numbers for whatever was selected when the tab was last opened */
  renderForecast();
  setupMaximize();
}

/* ================= table toggles & theme ================= */
document.querySelectorAll('.table-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-target');
    const chartEl = document.getElementById(target + '-chart');
    const legendEl = document.getElementById(target + '-legend');
    const tableEl = document.getElementById(target + '-table');
    const showingTable = tableEl.style.display !== 'none';
    tableEl.style.display = showingTable ? 'none' : 'table';
    if (chartEl) chartEl.style.display = showingTable ? 'block' : 'none';
    if (legendEl) legendEl.style.display = showingTable ? 'flex' : 'none';
    btn.textContent = showingTable ? 'View as table' : 'View as chart';
  });
});

const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  root.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeBtn.title = isDark ? 'Switch to dark' : 'Switch to light';
});


setupOverrideMenu();


/* Outstanding balance by customer: a searchable picker, kept in biggest-first order,
   scrolling vertically instead of squeezing 30 names into one card. */
let BALANCE_PICK = '';
function renderBalanceChart() {
  const all = (DATA.customer_balance || []).filter(d => d.balance !== 0);
  const pick = document.getElementById('balance-pick');
  if (pick) {
    const keep = BALANCE_PICK;
    pick.innerHTML = '<option value="">All customers (' + all.length + ')</option>' +
      all.map(d => `<option value="${esc(d.name)}">${esc(d.name)} &middot; ${fmtCompact(d.balance)}</option>`).join('');
    pick.value = all.some(d => d.name === keep) ? keep : '';
    BALANCE_PICK = pick.value;
  }
  const items = BALANCE_PICK ? all.filter(d => d.name === BALANCE_PICK) : all;
  renderHBar('balance-bar-chart', 'balance-bar-table', items, 'name', 'balance',
             'var(--series-1)', 'Customer', null, 'custBalance', true);
  const note = document.getElementById('balance-note');
  if (note) {
    const shown = items.reduce((a, d) => a + d.balance, 0);
    note.innerHTML = BALANCE_PICK
      ? `<b>${esc(BALANCE_PICK)}</b>: ${fmtINR(shown)} outstanding · <a href="#" id="balance-clear">show everyone</a>`
      : `${items.length} customer${items.length === 1 ? '' : 's'} · ${fmtINR(shown)} outstanding · biggest first: click a bar for the demands behind it`;
    const clr = document.getElementById('balance-clear');
    if (clr) clr.addEventListener('click', e => { e.preventDefault(); BALANCE_PICK = ''; renderBalanceChart(); });
  }
}

/* ================= Maximize any dashboard card =================
   Every card gets a ⤢ that lifts it into a full-screen shell. The card element itself
   moves (a placeholder holds its slot), so every element id stays exactly where it was
   and a plain renderAll() redraws the chart at the new width -- no duplicate DOM, no
   second copy of the data to keep in sync. */
let MAXIMIZED = null;   // { card, slot }

function setupMaximize() {
  document.querySelectorAll('#mtab-dashboard .card').forEach(card => {
    if (card.querySelector(':scope > .card-head > .max-btn')) return;
    let head = card.querySelector(':scope > .card-head');
    if (!head) {
      // a card with no header of its own still gets one, so nothing is left un-expandable
      head = document.createElement('div');
      head.className = 'card-head';
      head.innerHTML = '<div class="titles"><div class="t">' + (card.dataset.title || 'Detail') + '</div></div>';
      card.insertBefore(head, card.firstChild);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'max-btn';
    b.title = 'Expand to full screen';
    b.setAttribute('aria-label', 'Expand to full screen');
    b.innerHTML = '&#8599;';
    b.addEventListener('click', ev => { ev.stopPropagation(); maximizeCard(card); });
    head.appendChild(b);
  });
}

function maximizeCard(card) {
  if (MAXIMIZED) restoreCard();
  const slot = document.createElement('div');
  slot.className = 'max-slot';
  card.parentNode.insertBefore(slot, card);
  MAXIMIZED = { card, slot };
  const t = card.querySelector('.card-head .titles .t');
  document.getElementById('max-title').textContent = t ? t.textContent : 'Detail';
  const host = document.getElementById('max-host');
  host.innerHTML = '';
  host.appendChild(card);
  card.classList.add('is-max');
  document.getElementById('max-modal').classList.add('show');
  document.body.classList.add('no-scroll');
  try { renderAll(); } catch (e) { console.error(e); }
}

function restoreCard() {
  if (!MAXIMIZED) return;
  const { card, slot } = MAXIMIZED;
  card.classList.remove('is-max');
  slot.parentNode.insertBefore(card, slot);
  slot.remove();
  MAXIMIZED = null;
  document.getElementById('max-modal').classList.remove('show');
  document.body.classList.remove('no-scroll');
  try { renderAll(); } catch (e) { console.error(e); }
}
