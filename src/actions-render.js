/* ================= Action Items: rendering ================= */
const ACT_TYPE = {
  'overdue':    { cls: 'crit',    label: 'Overdue' },
  'chase-bank': { cls: 'partial', label: 'Chase bank now' },
  'due-soon':   { cls: 'warn',    label: 'Due soon' },
};

/* Everything else on this screen is money already committed. This is the other half of the
   builder's question: what is still to sell. It only has an answer for towers whose
   inventory has been entered, so the panel says plainly which ones have not. */
function renderUnsoldPanel() {
  const rows = inventoryOverview();
  const tot = { total: 0, sold: 0, hold: 0, unsold: 0, listed: 0, towers: 0, missing: 0 };
  rows.forEach(r => {
    if (r.hasInventory) {
      tot.listed++; tot.towers++;
      tot.total += r.counts.total; tot.sold += r.counts.sold;
      tot.hold += r.counts.hold; tot.unsold += r.counts.unsold;
    } else tot.missing++;
  });

  const body = document.getElementById('act-inv-body');
  if (body) {
    const page = pageSlice('inventory-actions', rows);
    renderPager('inv-act-pager', 'inventory-actions', rows.length, renderActions);
    body.innerHTML = page.map(r => {
      const c = r.counts;
      if (!r.hasInventory) {
        const soldOnly = customersOfTower(r.tower.id).filter(isLiveBooking).length;
        return `<tr><td class="cn">${esc(r.project ? r.project.name : '')}</td><td>${esc(r.tower.name)}</td>
          <td class="num"><span class="muted">not listed</span></td><td class="num">${soldOnly}</td>
          <td class="num">–</td><td class="num"><span class="muted">unknown</span></td>
          <td colspan="2"><button class="btn-tiny inv-setup" data-p="${r.project ? r.project.id : ''}" data-t="${r.tower.id}">Add this tower's units</button></td></tr>`;
      }
      const pct = c.total ? Math.round(c.unsold / c.total * 100) : 0;
      const byType = {};
      const seen = inventoryStatus(r.tower);
      towerUnits(r.tower).forEach(u => {
        if (seen[flatKey(r.tower.name, u.flat)] && seen[flatKey(r.tower.name, u.flat)].status !== 'cancelled') return;
        const n = unitTypeName(r.tower, u.typeId) || 'Unclassified';
        byType[n] = (byType[n] || 0) + 1;
      });
      const free = Object.entries(byType).sort((a, b) => b[1] - a[1])
        .map(([n, k]) => `${k} × ${esc(n)}`).join(', ');
      return `<tr>
        <td class="cn">${esc(r.project ? r.project.name : '')}</td><td>${esc(r.tower.name)}</td>
        <td class="num">${c.total}</td><td class="num">${c.sold}</td><td class="num">${c.hold}</td>
        <td class="num"><b>${c.unsold}</b></td>
        <td><div class="rbar-track" style="min-width:90px;"><div class="rbar-fill" style="width:${pct}%;background:var(--brand-primary)"></div></div>
            <div class="sub-line">${pct}% of the tower</div></td>
        <td>${free ? esc(free) : '<span class="muted">nothing left</span>'}
            ${c.unlisted ? `<div class="sub-line" style="color:var(--status-warn)">${c.unlisted} sold unit${c.unlisted===1?'':'s'} not in the list</div>` : ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" class="empty-row">No towers in the current selection.</td></tr>`;

    body.querySelectorAll('.inv-setup').forEach(b => b.addEventListener('click', () => {
      openSettings('Projects & towers');
      if (b.dataset.p) { openProjectEditor(b.dataset.p); openTowerEditor(b.dataset.t); }
    }));
  }
  const cnt = document.getElementById('act-unsold-count');
  if (cnt) cnt.textContent = tot.unsold;
  return tot;
}

function renderActions() {
  const queue = buildActionQueue();
  const stats = bankLagStats();
  const groups = bankGroups(queue);
  const gaps = gapReport();
  const ocr = ocrReport(queue);
  const inv = renderUnsoldPanel();

  document.getElementById('act-ctx-note').textContent = ctxLabel();
  const hs = document.getElementById('act-horizon');
  if (hs && hs.value !== String(ACT.horizon)) hs.value = String(ACT.horizon);
  const hn = document.getElementById('act-horizon-note');
  if (hn) hn.innerHTML = `Everything below counts demands falling due in the next <b>${ACT.horizon >= 3650 ? 'whole schedule' : ACT.horizon + ' days'}</b>, plus anything already overdue.`;

  // ---------- headline numbers ----------
  const overdue = queue.filter(q => q.type === 'overdue');
  const chase   = queue.filter(q => q.type === 'chase-bank');
  const soon    = queue.filter(q => q.type === 'due-soon');
  const sum = (a, k) => a.reduce((s, q) => s + q[k], 0);
  const critGaps = gaps.filter(r => r.gaps.some(x => x.sev === 'crit')).length;
  // every tile drills through to the records behind it
  document.getElementById('act-kpis').innerHTML = [
    { k: 'overdue',    l: 'Overdue', v: fmtCompact(sum(overdue, 'outstanding')), s: `${overdue.length} demand${overdue.length===1?'':'s'}`, tone: overdue.length ? 'bad' : '' },
    { k: 'chase-bank', l: 'Chase the bank now', v: fmtCompact(sum(chase, 'bankShare')), s: `${chase.length} disbursement${chase.length===1?'':'s'} to raise`, tone: chase.length ? 'bad' : '' },
    { k: 'due-soon',   l: `Due in ${ACT.horizon} days`, v: fmtCompact(sum(soon, 'outstanding')), s: `${soon.length} demand${soon.length===1?'':'s'}`, tone: '' },
    { k: 'own',        l: 'Customer to pay', v: fmtCompact(sum(queue, 'ownShare')), s: 'own-funds share of open demands', tone: '' },
    { k: 'bank',       l: 'Bank to disburse', v: fmtCompact(sum(queue, 'bankShare')), s: 'loan share of open demands', tone: '' },
    { k: 'gaps',       l: 'Records needing data', v: gaps.length, s: critGaps ? `${critGaps} blocking collection tracking` : 'minor gaps only', tone: critGaps ? 'bad' : '' },
    { k: 'ocr',        l: 'Own contribution pending', v: fmtCompact(ocr.pending), s: `across ${ocr.rows.filter(r=>r.state!=='done'&&r.state!=='notset').length} units`, tone: '' },
    { k: 'ocr-soon',   l: `Own money needed in ${ACT.horizon}d`, v: fmtCompact(ocr.soon), s: 'warn these customers now', tone: ocr.soon ? 'bad' : '' },
    { k: 'unsold',     l: 'Unsold units', v: inv.unsold,
      s: inv.listed ? `of ${inv.total} listed across ${inv.towers} tower${inv.towers===1?'':'s'}` : 'no inventory listed yet',
      tone: '' },
  ].map(t => `<div class="stat-tile drill${ACT.type === t.k ? ' active' : ''}" data-act="${t.k}" title="Click to see the records">
      <div class="label">${t.l}</div>
      <div class="value sm" ${t.tone==='bad'?'style="color:var(--status-critical)"':''}>${t.v}</div>
      <div class="sub">${t.s}</div><div class="drill-hint">show records &rarr;</div></div>`).join('');
  document.querySelectorAll('#act-kpis .drill').forEach(el =>
    el.addEventListener('click', () => drillTo(el.dataset.act)));

  // ---------- the action queue ----------
  const bankSel = document.getElementById('act-bank');
  const banks = [...new Set(queue.map(q => q.bank))].sort();
  bankSel.innerHTML = '<option value="all">All banks</option>' + banks.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  if (ACT.bank !== 'all' && !banks.includes(ACT.bank)) ACT.bank = 'all';
  bankSel.value = ACT.bank;

  const typeMatch = (q) => {
    if (ACT.type === 'all') return true;
    if (ACT.type === 'own')  return q.ownShare > 0;
    if (ACT.type === 'bank') return q.bankShare > 0;
    return q.type === ACT.type;
  };
  const needle = String(ACT.q || '').trim().toLowerCase();
  const hit = (q) => !needle || [q.customer, q.psNo, q.contact, q.project, q.tower, q.flat,
                                q.milestone, q.bank, q.assignedTo]
    .some(v => String(v || '').toLowerCase().includes(needle));
  let shown = queue.filter(q => typeMatch(q) && (ACT.bank === 'all' || q.bank === ACT.bank) && hit(q));
  if (ACT.type === 'own')  shown = shown.slice().sort((a, b) => b.ownShare - a.ownShare);
  if (ACT.type === 'bank') shown = shown.slice().sort((a, b) => b.bankShare - a.bankShare);
  const orderNote = ACT.type === 'own' ? ' · largest customer share first'
                  : ACT.type === 'bank' ? ' · largest bank share first' : '';
  document.getElementById('act-shown').textContent =
    (shown.length === queue.length ? `${queue.length} open demand${queue.length===1?'':'s'}`
                                   : `showing ${shown.length} of ${queue.length}`) + orderNote;
  const ts = document.getElementById('act-type');
  if (ts.value !== ACT.type) ts.value = ACT.type;
  const se = document.getElementById('act-search');
  if (se && se.value !== ACT.q) se.value = ACT.q;

  // ---------- paging (same control, same default, as every other listing) ----------
  const pageRows = pageSlice('queue', shown);
  renderPager('act-pager', 'queue', shown.length, () => renderActions());

  document.getElementById('act-queue-body').innerHTML = pageRows.map(q => {
    const T = ACT_TYPE[q.type];
    const when = q.daysToDue < 0 ? `<b class="crit-txt">${Math.abs(q.daysToDue)}d overdue</b>`
               : q.daysToDue === 0 ? '<b class="crit-txt">due today</b>'
               : `in ${q.daysToDue}d`;
    return `<tr class="row-click act-row" data-id="${q.customerId}" data-ms="${esc(q.milestoneId || '')}">
      <td><span class="pill ${T.cls}">${T.label}</span></td>
      <td class="cn">${esc(q.customer)}${q.contact ? `<div class="sub-line">${esc(q.contact)}</div>` : ''}</td>
      <td>${esc(q.project)}<div class="sub-line">${esc(q.tower)} · ${esc(q.flat)}</div></td>
      <td>${esc(q.milestone)}<div class="sub-line">${Math.round((q.pct||0)*1000)/10}% of agreement${q.partial ? ` · <span class="warn-txt">part-paid ${fmtINR(q.alreadyPaid)}</span>` : ''}</div></td>
      <td>${fmtDate(q.due)}<div class="sub-line">${when}</div></td>
      <td class="num"><b>${fmtINR(q.outstanding)}</b></td>
      <td class="num">${q.ownShare > 0
            ? `${fmtINR(q.ownShare)}${q.gstOnDemand ? `<div class="sub-line">incl. GST ${fmtINR(q.gstOnDemand)}</div>` : ''}`
            : '<span class="muted">–</span>'}</td>
      <td class="num">${q.bankShare > 0 ? fmtINR(q.bankShare) : '<span class="muted">–</span>'}</td>
      <td>${q.bank === 'OWN FUNDS' ? '<span class="muted">self-funded</span>'
            : `${esc(q.bank)}${q.noLoan ? '<div class="sub-line"><b class="crit-txt">no loan figure</b></div>'
                : q.provisional ? '<div class="sub-line"><b class="warn-txt">sanction awaited</b></div>' : ''}`}</td>
      <td>${q.chaseBy
            ? `${fmtDate(q.chaseBy)}<div class="sub-line">${q.lead}d lead${q.chaseBy <= new Date() ? ' · <b class="crit-txt">raise it now</b>' : ''}</div>`
            : NIL}</td>
      <td>${q.assignedTo ? `${esc(q.assignedTo)}${q.assignedPhone ? `<div class="sub-line">${esc(q.assignedPhone)}</div>` : ''}`
            : '<span class="muted">unassigned</span>'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="11" class="empty-row">Nothing needs chasing in this view. Either everything is settled, or the next demands fall outside ${ACT.horizon} days.</td></tr>`;
  document.querySelectorAll('#act-queue-body .act-row').forEach(tr => tr.addEventListener('click', () => {
    openCollect(tr.dataset.id, tr.dataset.ms || null);
  }));

  // ---------- bank-wise groups + learned turnaround ----------
  document.getElementById('act-banks').innerHTML = groups.map(g => {
    const s = g.stats;
    const conf = s ? { good: 'ok', fair: 'warn', thin: 'unk' }[s.confidence] : 'unk';
    const bands = s ? s.bands.filter(b => b.n > 0).map(b =>
      `<div class="band"><span>${b.label}</span><b>${b.avg}d</b><span class="muted">${b.n} case${b.n===1?'':'s'}</span></div>`).join('') : '';
    return `<div class="bank-card drill-bank" data-bank="${esc(g.bank)}" title="Click to see this bank's demands">
      <div class="bank-head">
        <div class="bn">${esc(g.bank)}</div>
        <div class="bmeta">${g.units} unit${g.units===1?'':'s'}${g.overdue?` · <b class="crit-txt">${g.overdue} overdue</b>`:''}${g.provisional?` · <b class="warn-txt">${g.provisional} awaiting sanction</b>`:''}</div>
      </div>
      <div class="bank-figs">
        <div><span>${g.provisional ? 'Sanctioned + expected' : 'Sanctioned'}</span><b>${fmtCompact(g.sanctioned)}</b></div>
        <div><span>Disbursed</span><b>${fmtCompact(g.disbursed)}</b></div>
        <div><span>Headroom left</span><b>${fmtCompact(g.headroom)}</b></div>
        <div><span>Pending from bank</span><b class="${g.pendingBank?'crit-txt':''}">${fmtCompact(g.pendingBank)}</b></div>
      </div>
      ${g.bank === 'OWN FUNDS'
        ? `<div class="bank-note muted">Self-funded: nothing to chase with a bank.</div>`
        : s
        ? `<div class="bank-lag">
             <div class="lead"><span>Start chasing</span><b>${s.lead} days</b><span>before the due date</span>
               <span class="pill ${conf}">${s.confidence === 'good' ? 'reliable pattern' : s.confidence === 'fair' ? 'early pattern' : 'too few cases'}</span></div>
             <div class="lagline">Actual turnaround across <b>${s.n}</b> disbursement${s.n===1?'':'s'}:
               typically <b>${s.median}d</b>, average <b>${s.avg}d</b>, range ${s.min}–${s.max}d</div>
             ${bands ? `<div class="bands">${bands}</div>` : ''}
           </div>`
        : `<div class="bank-note muted">No disbursement history yet: log a few bank receipts with the date the demand was raised and a recommended lead time will appear here.</div>`}
    </div>`;
  }).join('') || `<div class="empty-row">No units in this view.</div>`;
  document.querySelectorAll('#act-banks .drill-bank').forEach(el => el.addEventListener('click', () => {
    ACT.bank = el.dataset.bank;
    if (ACT.type === 'gaps' || ACT.type === 'ocr' || ACT.type === 'ocr-soon') ACT.type = 'all';
    renderActions();
    scrollToPanel('act-queue-body');
  }));

  // ---------- incomplete data ----------
  document.getElementById('act-gaps-count').textContent = gaps.length;
  const gapsPage = pageSlice('gaps', gaps);
  renderPager('gaps-pager', 'gaps', gaps.length, () => renderActions());
  document.getElementById('act-gaps-body').innerHTML = gapsPage.map(r => `
    <tr class="row-click gap-row" data-id="${r.c.id}">
      <td class="cn">${esc(r.c.name) || '<span class="muted">Unnamed</span>'}</td>
      <td>${esc((towerOf(r.c).project || {}).name || '–')}<div class="sub-line">${esc(r.c.wing||'')} · ${esc(r.c.flat||'')}</div></td>
      <td>${r.gaps.filter(g => g.sev !== 'info').map(g =>
            `<span class="pill gap-pill ${g.sev === 'crit' ? 'crit' : 'warn'}" data-id="${esc(r.c.id)}"
               data-rule="${esc(g.id)}" title="Open this file and fix it">${g.t}</span>`).join(' ')}</td>
    </tr>`).join('') || `<tr><td colspan="3" class="empty-row">Everything in this view has the data needed to track collections.</td></tr>`;
  document.querySelectorAll('#act-gaps-body .gap-row').forEach(tr => tr.addEventListener('click', () => {
    openGaps(tr.dataset.id, null);
  }));
  // clicking the pill itself opens the file with that one issue highlighted
  document.querySelectorAll('#act-gaps-body .gap-pill').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    openGaps(el.dataset.id, el.dataset.rule);
  }));

  // ---------- OCR ----------
  // every one of these opens the units behind it, with its own column highlighted
  document.getElementById('act-ocr-kpis').innerHTML = [
    { r: 'ocrReq', l: 'Own contribution required', v: fmtCompact(ocr.total), s: 'across all units in view' },
    { r: 'ocrPaid', l: 'Received', v: fmtCompact(ocr.collected), s: `${ocr.done} fully settled` },
    { r: 'ocrPending',  l: 'Still to arrange', v: fmtCompact(ocr.pending), s: ocr.provisional ? `${ocr.provisional} still provisional` : 'all sanctions in' },
    { r: 'ocrSoon',     l: `Needed within ${ACT.horizon} days`, v: fmtCompact(ocr.soon), s: 'tell these customers now' },
    { r: 'ocrNonLoanable', l: 'Never loanable', v: fmtCompact(ocr.nonLoanable), s: 'stamp duty + registration + charges' },
  ].map(t => `<div class="stat-tile rdrill ocr-drill" data-report="${t.r}" title="Click to see the units behind this figure">
      <div class="label">${t.l}</div><div class="value sm">${t.v}</div>
      <div class="sub">${t.s}</div><div class="drill-hint">show records &rarr;</div></div>`).join('');
  document.querySelectorAll('#act-ocr-kpis .ocr-drill').forEach(el =>
    el.addEventListener('click', () => openReport(el.dataset.report, null)));
  const ocrRows = ocr.rows.filter(r => r.state !== 'done' && r.state !== 'notset');
  const ocrPage = pageSlice('ocr', ocrRows);
  renderPager('ocr-pager', 'ocr', ocrRows.length, () => renderActions());
  document.getElementById('act-ocr-body').innerHTML = ocrPage.map(r => `
    <tr class="row-click ocr-row" data-id="${r.c.id}">
      <td class="cn">${esc(r.c.name)}${r.pr.provisional ? ' <span class="pill warn">provisional</span>' : ''}</td>
      <td>${esc((towerOf(r.c).project || {}).name || '–')}<div class="sub-line">${esc(r.c.wing||'')} · ${esc(r.c.flat||'')}</div></td>
      <td class="num">${fmtINR(r.pr.totalCost)}<div class="sub-line">loan ${fmtCompact(r.pr.loan)}</div></td>
      <td class="num">${fmtINR(r.amt)}<div class="sub-line">${r.pr.ownPctOfCost}% of cost</div></td>
      <td class="num">${fmtINR(r.paid)}</td>
      <td class="num"><b>${r.pending ? fmtINR(r.pending) : '–'}</b></td>
      <td class="num">${r.soon ? `<b class="crit-txt">${fmtINR(r.soon)}</b>` : '<span class="muted">–</span>'}</td>
    </tr>`).join('') || `<tr><td colspan="7" class="empty-row">Every customer's own contribution is fully received.</td></tr>`;
  document.querySelectorAll('#act-ocr-body .ocr-row').forEach(tr => tr.addEventListener('click', () =>
    openCollect(tr.dataset.id, null)));
}

/* ---------- drill-down: a headline number should always lead to its records ---------- */
function scrollToPanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const panel = el.closest('.panel') || el;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel.classList.remove('flash');
  void panel.offsetWidth;          // restart the animation
  panel.classList.add('flash');
}
function drillTo(kind) {
  if (kind === 'gaps') { scrollToPanel('act-gaps-body'); return; }
  if (kind === 'ocr' || kind === 'ocr-soon') { scrollToPanel('act-ocr-body'); return; }
  if (kind === 'unsold') { scrollToPanel('act-inv-body'); return; }
  ACT.type = (ACT.type === kind) ? 'all' : kind;   // clicking the active tile clears it
  ACT.bank = 'all';
  pagerReset('queue');
  renderActions();
  scrollToPanel('act-queue-body');
}
