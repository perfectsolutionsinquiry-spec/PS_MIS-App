/* ================= Report drill-through =================
   Every number on the dashboard is a summary of specific records. Clicking it opens
   those records with the column that produced the number highlighted, so you can see
   at a glance which customer contributed what.
*/
let RPT = { kind: null, param: null, q: '', sort: { key: null, dir: 1 } };

const INR = (v) => fmtINR(v || 0);
const TXT = (v) => (v == null || v === '') ? '<span class="muted">–</span>' : esc(String(v));

// one enriched row per customer in the current Project / Tower view
function reportCustomerRows() {
  return (DATA.customers || []).map(c0 => {
    const c = (c0.id && STATE.customers.find(x => x.id === c0.id))
           || STATE.customers.find(x => x.name === c0.name);
    const pr = c ? fundingProgress(toCalcCustomer(c), STATE.collections) : null;
    return {
      id: c ? c.id : null, psNo: c ? c.psNo : '',
      name: c0.name, project: c0.project, tower: c0.tower, flat: c0.flat,
      bank: c0.bank, dl_status: c0.dl_status,
      agreement: c0.agreement_value, due: c0.due, received: c0.received, balance: c0.balance,
      loan: c0.loan_amt,
      gst_due: c0.gst_due, gst_received: c0.gst_received, gst_balance: c0.gst_balance,
      totalCost: pr ? pr.totalCost : 0, ownReq: pr ? pr.ownRequired : 0,
      ownPaid: pr ? pr.ownPaid : 0, ownPending: pr ? pr.ownPending : 0,
      bankPending: pr ? pr.bankPending : 0,
      eff: c0.due ? Math.round(c0.received / c0.due * 100) : null,
      rating: effectiveRating(c0.name).rating,
    };
  });
}
const WHO = [
  { k: 'psNo',    l: 'PS no.',   f: TXT },
  { k: 'name',    l: 'Customer', f: TXT },
  { k: 'project', l: 'Project',  f: TXT },
  { k: 'tower',   l: 'Tower',    f: TXT },
  { k: 'flat',    l: 'Flat',     f: TXT },
];
const money = (k, l) => ({ k, l, f: INR, num: true });

// timeline rows for the current view
function reportTimelineRows(filter) {
  return (DATA.payment_timeline || []).filter(filter || (() => true)).map(t => {
    const c = STATE.customers.find(x => x.name === t.customer);
    return { id: c ? c.id : null, name: t.customer, project: t.project, tower: t.tower,
             flat: t.flat != null ? t.flat : (t.unit || '').split('-').slice(1).join('-'),
             milestone: t.milestone, due: t.due_date ? fmtDate(t.due_date) : '–',
             dueRaw: t.due_date, status: t.status, amount: t.amount,
             paid: t.amount_paid || 0, outstanding: Math.max(0, t.amount - (t.amount_paid || 0)),
             delay: t.delay, reason: t.reason || '' };
  });
}

/* ---------- the registry: what each dashboard number is made of ---------- */

/* --- resolving a "<grain>:<iso>" bucket back to the receipts behind it --- */
function dayParamParts(p) {
  const str = String(p || '');
  const i = str.indexOf(':');
  if (i < 0) return { grain: 'legacy', iso: str };
  return { grain: str.slice(0, i), iso: str.slice(i + 1) };
}
function isoLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function dayParamMatches(p, d) {
  const { grain, iso } = dayParamParts(p);
  const k = isoLocal(d);
  if (grain === 'month') return k.slice(0, 7) === iso;
  if (grain === 'week') {
    const end = new Date(new Date(iso + 'T00:00:00').getTime() + 6 * 86400000);
    return k >= iso && k <= isoLocal(end);
  }
  if (grain === 'day') return k === iso;
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${M[d.getMonth()]} ${d.getDate()}` === iso;
}
function dayParamLabel(p) {
  const { grain, iso } = dayParamParts(p);
  const fmt = s => { const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
  if (grain === 'month') { const d = new Date(iso + '-01T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  if (grain === 'week') { const end = new Date(new Date(iso + 'T00:00:00').getTime() + 6 * 86400000);
    return 'week of ' + fmt(iso) + ' – ' + fmt(isoLocal(end)); }
  if (grain === 'day') return fmt(iso);
  return iso;
}


/* Breaks a customer's outstanding balance into the demands behind it. Reconciles to
   AM by construction: the stages covered by due% are the demand, total received is
   applied to them oldest-first, and whatever is left over is the balance. */
function balanceBreakdown(name) {
  const c = STATE.customers.find(x => x.name === name);
  if (!c) return [];
  const cc = toCalcCustomer(c);
  const sched = scheduleForCustomer(c);
  const d = deriveCustomer(cc, sumRecoveryFor(name), sched);
  const cum = scheduleCumPct(sched);
  const duePct = (cc.duePct || 0) * 100;
  const paidRec = STATE.milestonePaid[name] || {};

  // every stage the current demand stage has reached
  const raised = [];
  sched.forEach((m, i) => {
    if (cum[i] <= duePct + 0.0001) raised.push({ m, i, amount: d.milestoneAmounts[i] });
  });
  // demanded may not equal AI exactly (due% can sit mid-stage) -- carry the difference
  const demanded = raised.reduce((a, x) => a + x.amount, 0);
  const gap = round0(d.AI) - round0(demanded);
  let pot = round0(d.AJ);                       // everything received, incl. TDS credit
  const rows = raised.map(({ m, i, amount }) => {
    const applied = Math.min(pot, amount);
    pot -= applied;
    const due = stageDueDate(m, cc.bookingDate, cc.possessionDate, cum[i]);
    const rec = paidRec[m.id];
    return { name, milestone: m.label,
             due: due ? fmtDate(due) : '–', dueRaw: due ? due.toISOString() : null,
             status: applied >= amount - 1 ? 'Paid' : (applied > 0 ? 'Partially Paid' : 'Due, pending'),
             amount, paid: applied, outstanding: round0(amount - applied),
             reason: rec ? (rec.reason || '') : '' };
  }).filter(r => r.outstanding > 0.5 || r.paid > 0.5);
  if (Math.abs(gap) > 0.5) {
    rows.push({ name, milestone: raised.length ? 'Part of the next stage already demanded'
                                               : 'Demand raised (as per demand letter)',
                due: '–', dueRaw: null, status: 'Due, pending',
                amount: gap, paid: Math.min(pot, Math.max(0, gap)),
                outstanding: round0(gap - Math.min(pot, Math.max(0, gap))), reason: '' });
  }
  return rows.filter(r => r.outstanding !== 0 || r.paid !== 0);
}

const REPORTS = {
  agreement: () => ({ title: 'Total agreement value', sub: 'Every unit in this view',
    rows: reportCustomerRows(), hi: 'agreement',
    cols: [...WHO, money('agreement','Agreement value'), money('received','Received'), money('balance','Balance')] }),

  received: () => ({ title: 'Total received', sub: 'Money actually collected against each unit',
    rows: reportCustomerRows(), hi: 'received',
    cols: [...WHO, money('agreement','Agreement value'), money('due','Due as per DL'), money('received','Received'), money('balance','Balance')] }),

  balance: () => ({ title: 'Balance outstanding', sub: 'Units carrying a balance at the current demand stage',
    rows: reportCustomerRows().filter(r => Math.abs(r.balance) > 0.5), hi: 'balance',
    cols: [...WHO, money('due','Due as per DL'), money('received','Received'), money('balance','Balance'), { k:'rating', l:'Reliability', f: v => `<span class="pill ${{green:'ok',yellow:'warn',red:'crit',unknown:'unk'}[v]}">${v}</span>` }] }),

  loan: () => ({ title: 'Loan sanctioned', sub: 'Sanctioned amount per loan, and how much is still to come',
    rows: reportCustomerRows(), hi: 'loan',
    cols: [...WHO, { k:'bank', l:'Bank', f: TXT }, { k:'dl_status', l:'Status', f: TXT },
           money('loan','Loan sanctioned'), money('bankPending','Left to disburse')] }),

  efficiency: () => ({ title: 'Collection efficiency', sub: 'Received against what has actually been demanded',
    rows: reportCustomerRows(), hi: 'received',
    cols: [...WHO, money('due','Demanded'), money('received','Received'),
           { k:'eff', l:'Efficiency', num: true, f: (v) => v == null ? '–' : Math.round(v) + '%' }] }),

  ocrSoon: () => ({ title: `Own money needed within ${ACT.horizon} days`,
    sub: 'Their share of every demand falling due inside the window: tell these customers now',
    rows: ocrReportRows().filter(r => r.soon !== 0), hi: 'soon', cols: OCR_COLS() }),

  ocrNonLoanable: () => ({ title: 'Never loanable',
    sub: 'Stamp duty, registration and other charges: no bank funds these, they are always the customer\u2019s own money',
    rows: ocrReportRows().filter(r => r.nonLoanable !== 0), hi: 'nonLoanable', cols: OCR_COLS() }),

  units: () => ({ title: 'Units tracked', sub: 'Every unit in this view',
    rows: reportCustomerRows(), hi: 'name',
    cols: [...WHO, { k:'bank', l:'Bank', f: TXT }, money('agreement','Agreement value'), money('balance','Balance')] }),

  status: (p) => ({ title: `Disbursement status: ${titleCase(p)}`, sub: 'Loans at this stage of the process',
    rows: reportCustomerRows().filter(r => r.dl_status === p), hi: 'dl_status',
    cols: [...WHO, { k:'bank', l:'Bank', f: TXT }, { k:'dl_status', l:'Status', f: TXT },
           money('loan','Loan sanctioned'), money('bankPending','Left to disburse')] }),

  bank: (p) => ({ title: `Loan with ${p}`, sub: 'Every loan lodged with this lender',
    rows: reportCustomerRows().filter(r => r.bank === p), hi: 'loan',
    cols: [...WHO, { k:'dl_status', l:'Status', f: TXT }, money('loan','Loan sanctioned'),
           money('bankPending','Left to disburse'), money('balance','Balance')] }),

  // The bar is AM = (agreement value x due%) - received, i.e. the balance at the CURRENT
  // demand stage. The drawer used to list every unpaid milestone including ones nobody has
  // reached, so its total came out several times the figure it was opened from. It is now
  // built from the same basis as the bar -- the stages covered by due%, with money received
  // applied oldest-first -- so the rows always add up to exactly the bar.
  custBalance: (p) => ({ title: `${p}: what makes up the balance`,
    sub: 'Demands raised to date, with receipts applied oldest first',
    rows: balanceBreakdown(p), hi: 'outstanding',
    cols: [{ k:'milestone', l:'Milestone', f: TXT }, { k:'due', l:'Due', f: TXT },
           { k:'status', l:'Status', f: TXT }, money('amount','Demand'), money('paid','Paid'),
           money('outstanding','Outstanding')] }),

  // param is "<grain>:<iso>" -- day:2026-06-27, week:2026-06-22 (Monday), month:2026-06.
  // Older callers passed a bare "Jun 27"; both still resolve.
  day: (p) => ({ title: `Collections: ${dayParamLabel(p)}`, sub: 'Receipts logged in this window',
    rows: STATE.collections.filter(e => {
        const d = e.date instanceof Date ? e.date : new Date(e.date);
        if (isNaN(d.getTime())) return false;
        if (!(DATA.customers || []).some(c => c.name === e.customer)) return false;
        return dayParamMatches(p, d);
      }).map(e => {
        const c = STATE.customers.find(x => x.name === e.customer);
        return { id: c ? c.id : null, name: e.customer, flat: e.flat,
                 source: e.source === 'Bank' ? 'Bank disbursement'
            : e.source === 'Own' ? 'Own funds' : 'Not classified',
                 remark: e.remark, flatCost: e.flatCost, gst: e.gst, total: (e.flatCost||0)+(e.gst||0) };
      }), hi: 'total',
    cols: [{ k:'name', l:'Customer', f: TXT }, { k:'flat', l:'Flat', f: TXT },
           { k:'source', l:'Source', f: TXT }, { k:'remark', l:'Against', f: TXT },
           money('flatCost','Flat cost'), money('gst','GST'), money('total','Total')] }),

  // the meter counts a stage as invoiced only once it is no longer "Not Yet Due"
  milestone: (p) => ({ title: `${p}: across all units`, sub: 'Every unit that has reached this stage',
    rows: reportTimelineRows(t => t.milestone === p && t.status !== 'Not Yet Due'), hi: 'amount',
    cols: [{ k:'name', l:'Customer', f: TXT }, { k:'tower', l:'Tower', f: TXT }, { k:'flat', l:'Flat', f: TXT },
           { k:'due', l:'Due', f: TXT }, { k:'status', l:'Status', f: TXT },
           money('amount','Demand'), money('paid','Paid'), money('outstanding','Outstanding')] }),

  tower: (p) => ({ title: `Tower ${p}`, sub: 'Units in this tower',
    rows: reportCustomerRows().filter(r => ('Tower ' + (r.tower || '–')) === p || r.tower === p), hi: 'received',
    cols: [...WHO, money('agreement','Agreement value'), money('received','Collected'), money('balance','Balance')] }),

  gstDue:  () => ({ title: 'GST liability', sub: 'GST chargeable on each unit',
    rows: reportCustomerRows(), hi: 'gst_due',
    cols: [...WHO, money('agreement','Agreement value'), money('gst_due','GST liability'),
           money('gst_received','GST received'), money('gst_balance','GST balance')] }),
  gstRecd: () => ({ title: 'GST received', sub: 'GST actually collected',
    rows: reportCustomerRows(), hi: 'gst_received',
    cols: [...WHO, money('gst_due','GST liability'), money('gst_received','GST received'), money('gst_balance','GST balance')] }),
  gstBal:  () => ({ title: 'GST balance', sub: 'GST still to be collected: biggest first',
    rows: reportCustomerRows().filter(r => Math.abs(r.gst_balance) > 0.5).sort((a,b) => b.gst_balance - a.gst_balance), hi: 'gst_balance',
    cols: [...WHO, money('gst_due','GST liability'), money('gst_received','GST received'), money('gst_balance','GST balance')] }),

  /* All five OCR drawers are built from ocrReportRows -- the same rows the OCR tiles are
     totalled from -- so a tile and the records behind it can never drift apart. */
  ocrReq:  () => ({ title: 'Own contribution required',
    sub: 'What each customer has to find from their own pocket across the whole build',
    rows: ocrReportRows().filter(r => r.ownReq !== 0), hi: 'ownReq', cols: OCR_COLS() }),

  ocrPaid: () => ({ title: 'Own contribution received',
    sub: 'Own funds already collected, unit by unit',
    rows: ocrReportRows().filter(r => r.ownPaid !== 0), hi: 'ownPaid', cols: OCR_COLS() }),

  ocrPending: () => ({ title: 'Own contribution still to arrange',
    sub: 'Own money not yet received: this is what becomes a balloon payment if nobody warns them',
    rows: ocrReportRows().filter(r => r.ownPending !== 0).sort((a, b) => b.ownPending - a.ownPending),
    hi: 'ownPending', cols: OCR_COLS() }),

  ageing: (p) => ({ title: p ? `${p}: overdue milestones` : 'Overdue milestones',
    sub: 'Demands past their due date with nothing recorded',
    rows: reportTimelineRows(t => t.status === 'Due, pending' && (!p || t.customer === p))
            .map(r => ({ ...r, daysOver: r.dueRaw ? daysOverdue(r.dueRaw) : 0 }))
            .sort((a,b) => b.daysOver - a.daysOver), hi: 'daysOver',
    cols: [{ k:'name', l:'Customer', f: TXT }, { k:'tower', l:'Tower', f: TXT }, { k:'flat', l:'Flat', f: TXT },
           { k:'milestone', l:'Milestone', f: TXT }, { k:'due', l:'Due', f: TXT },
           money('outstanding','Outstanding'), { k:'daysOver', l:'Days overdue', num: true, f: v => v + 'd' }] }),

  reliability: (p) => ({ title: `Payment reliability: ${p}`, sub: 'Customers in this band',
    rows: reportCustomerRows().filter(r => r.rating === p), hi: 'rating',
    cols: [...WHO, { k:'rating', l:'Reliability', f: v => `<span class="pill ${{green:'ok',yellow:'warn',red:'crit',unknown:'unk'}[v]}">${v}</span>` },
           money('due','Demanded'), money('received','Received'), money('balance','Balance')] }),
};

/* ---------- the drawer ---------- */
function openReport(kind, param) {
  const def = REPORTS[kind];
  if (!def) return;
  RPT = { kind, param, q: '', sort: { key: null, dir: 1 } };
  pagerReset('report');
  document.getElementById('report-modal').classList.add('show');
  renderReport();
}
function closeReport() { document.getElementById('report-modal').classList.remove('show'); }

function renderReport() {
  const r = REPORTS[RPT.kind](RPT.param);
  document.getElementById('rpt-title').textContent = r.title;
  document.getElementById('rpt-sub').textContent = r.sub;
  const hiCol = r.cols.find(c => c.k === r.hi);
  document.getElementById('rpt-hint').innerHTML = hiCol
    ? `The highlighted <b>${esc(hiCol.l)}</b> column is what this figure was built from.` : '';

  let rows = r.rows.slice();
  const q = RPT.q.trim().toLowerCase();
  if (q) rows = rows.filter(x => r.cols.some(c => String(x[c.k] == null ? '' : x[c.k]).toLowerCase().includes(q)));
  if (RPT.sort.key) rows.sort((a, b) => cmpVals(a[RPT.sort.key], b[RPT.sort.key]) * RPT.sort.dir);

  document.getElementById('rpt-thead').innerHTML = '<tr>' + r.cols.map(c =>
    `<th class="sortable ${c.num ? 'num' : ''} ${c.k === r.hi ? 'hi' : ''}" data-k="${c.k}">${esc(c.l)}</th>`).join('') + '</tr>';
  // the page shows a slice; the total underneath stays the whole report, so a drawer still
  // reconciles to the tile it was opened from
  const rptPage = pageSlice('report', rows);
  renderPager('rpt-pager', 'report', rows.length, renderReport);
  document.getElementById('rpt-body').innerHTML = rptPage.map(x =>
    `<tr class="${x.id ? 'row-click rpt-row' : ''}" data-id="${x.id || ''}">` + r.cols.map(c =>
      `<td class="${c.num ? 'num' : ''} ${c.k === r.hi ? 'hi' : ''}">${c.f ? c.f(x[c.k], x) : TXT(x[c.k])}</td>`).join('') + '</tr>'
    ).join('') || `<tr><td colspan="${r.cols.length}" class="empty-row">No records behind this figure.</td></tr>`;

  // running total of the highlighted column, so the drawer reconciles to the tile
  const tot = hiCol && hiCol.num ? rows.reduce((a, x) => a + (Number(x[r.hi]) || 0), 0) : null;
  document.getElementById('rpt-count').innerHTML =
    `${rows.length} record${rows.length === 1 ? '' : 's'}` +
    (tot != null ? ` · <b>${hiCol.l}: ${fmtINR(tot)}</b>` : '');

  document.querySelectorAll('#rpt-thead th.sortable').forEach(th => {
    th.classList.remove('asc','desc');
    if (th.dataset.k === RPT.sort.key) th.classList.add(RPT.sort.dir === 1 ? 'asc' : 'desc');
    th.addEventListener('click', () => {
      if (RPT.sort.key === th.dataset.k) RPT.sort.dir = -RPT.sort.dir;
      else { RPT.sort.key = th.dataset.k; RPT.sort.dir = 1; }
      pagerReset('report');
      renderReport();
    });
  });
  document.querySelectorAll('#rpt-body .rpt-row').forEach(tr => tr.addEventListener('click', () => {
    closeReport();
    openEditor(tr.dataset.id);
    document.querySelector('.mtab-btn[data-mtab="customers"]').click();
  }));
}
